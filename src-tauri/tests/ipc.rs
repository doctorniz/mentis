//! Drives the real vault commands through Tauri's IPC layer.

use mentis_lib::{vault_fs, with_vault_commands};
use serde_json::{Value, json};
use tauri::Manager;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{INVOKE_KEY, get_ipc_response, mock_builder, mock_context, noop_assets};
use tauri::webview::InvokeRequest;

fn request(
    url: &tauri::Url,
    cmd: &str,
    body: InvokeBody,
    headers: &[(&'static str, String)],
) -> InvokeRequest {
    let mut map = tauri::http::HeaderMap::new();
    for (k, v) in headers {
        map.insert(*k, v.parse().unwrap());
    }
    InvokeRequest {
        cmd: cmd.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: url.clone(),
        body,
        headers: map,
        invoke_key: INVOKE_KEY.into(),
    }
}

#[test]
fn vault_commands_round_trip_through_ipc() {
    let app = with_vault_commands(mock_builder())
        .build(mock_context(noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();

    // Commands are only accepted from the app's own origin.
    let url = webview.url().unwrap();

    let dir = std::env::temp_dir().join(format!("mentis-ipc-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let root = app
        .state::<vault_fs::VaultRoots>()
        .grant(&dir)
        .unwrap()
        .to_string_lossy()
        .to_string();

    let call = |cmd: &str, args: Value| {
        get_ipc_response(&webview, request(&url, cmd, InvokeBody::Json(args), &[]))
    };
    let enc = |s: &str| {
        s.bytes()
            .map(|b| match b {
                b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'.' | b'-' | b'_' => {
                    (b as char).to_string()
                }
                _ => format!("%{b:02X}"),
            })
            .collect::<String>()
    };

    call("vault_mkdir", json!({ "root": root, "path": "notes/sub" })).unwrap();
    let written = get_ipc_response(
        &webview,
        request(
            &url,
            "vault_write",
            InvokeBody::Raw(b"# Hello \xE2\x9C\x93".to_vec()),
            &[
                ("x-vault-root", enc(&root)),
                ("x-vault-path", enc("notes/héllo.md")),
            ],
        ),
    );
    assert!(written.is_ok(), "{written:?}");

    let read = call(
        "vault_read",
        json!({ "root": root, "path": "notes/héllo.md" }),
    )
    .unwrap();
    let tauri::ipc::InvokeResponseBody::Raw(bytes) = read else {
        panic!("vault_read should answer with raw bytes");
    };
    assert_eq!(bytes, "# Hello ✓".as_bytes());

    let listing: Value = call("vault_read_dir", json!({ "root": root, "path": "notes" }))
        .unwrap()
        .deserialize()
        .unwrap();
    let mut names: Vec<_> = listing
        .as_array()
        .unwrap()
        .iter()
        .map(|e| {
            (
                e["name"].as_str().unwrap().to_string(),
                e["isDirectory"].as_bool().unwrap(),
            )
        })
        .collect();
    names.sort();
    assert_eq!(
        names,
        vec![("héllo.md".into(), false), ("sub".into(), true)]
    );

    call(
        "vault_rename",
        json!({ "root": root, "from": "notes/héllo.md", "to": "notes/sub/x.md" }),
    )
    .unwrap();
    let exists = |p: &str| -> bool {
        call("vault_exists", json!({ "root": root, "path": p }))
            .unwrap()
            .deserialize()
            .unwrap()
    };
    assert!(!exists("notes/héllo.md"));
    assert!(exists("notes/sub/x.md"));

    assert!(
        call(
            "vault_read",
            json!({ "root": root, "path": "../outside.md" })
        )
        .is_err()
    );
    assert!(call("vault_remove_dir", json!({ "root": root, "path": "" })).is_err());

    call("vault_remove_dir", json!({ "root": root, "path": "notes" })).unwrap();
    assert!(!exists("notes"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn index_operations_round_trip_through_ipc() {
    let app = with_vault_commands(mock_builder())
        .build(mock_context(noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let url = webview.url().unwrap();
    let call = |op: &str, arg: Option<Value>| {
        let body = match arg {
            Some(arg) => json!({ "op": op, "arg": arg }),
            None => json!({ "op": op }),
        };
        get_ipc_response(
            &webview,
            request(&url, "index_call", InvokeBody::Json(body), &[]),
        )
        .map(|r| r.deserialize::<Value>().unwrap())
    };

    let vault = format!("ipc-test-{}", std::process::id());
    let opened = call("open", Some(json!({ "vaultId": vault }))).unwrap();
    assert_eq!(opened["fileCount"], 0);
    call(
        "upsert",
        Some(json!({ "vaultId": vault, "docs": [{
            "path": "a.md", "type": "markdown", "title": "Alpha",
            "content": "wombats and quokkas", "tags": [], "size": 1, "mtime": 1
        }] })),
    )
    .unwrap();
    let found = call("search", Some(json!({ "query": "wombat" }))).unwrap();
    assert_eq!(found[0]["path"], "a.md");
    assert_eq!(call("manifest", None).unwrap().as_array().unwrap().len(), 1);
    assert!(call("nope", None).is_err());

    call("close", None).unwrap();
}

#[test]
fn watching_a_vault_announces_outside_changes() {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{Duration, Instant};
    use tauri::Listener;

    let app = with_vault_commands(mock_builder())
        .build(mock_context(noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let url = webview.url().unwrap();
    let call = |cmd: &str, body: Value| {
        get_ipc_response(&webview, request(&url, cmd, InvokeBody::Json(body), &[]))
    };

    let dir = std::env::temp_dir().join(format!("mentis-ipc-watch-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let root = std::fs::canonicalize(&dir)
        .unwrap()
        .to_string_lossy()
        .to_string();

    // A folder the user never opened cannot be watched.
    assert!(call("vault_watch_start", json!({ "root": root })).is_err());

    app.state::<vault_fs::VaultRoots>().grant(&dir).unwrap();
    let signals = Arc::new(AtomicUsize::new(0));
    let seen = Arc::clone(&signals);
    app.listen("vault-changed", move |_| {
        seen.fetch_add(1, Ordering::SeqCst);
    });
    call("vault_watch_start", json!({ "root": root })).unwrap();
    std::fs::write(dir.join("outside.md"), "written by another program").unwrap();

    let until = Instant::now() + Duration::from_secs(10);
    while signals.load(Ordering::SeqCst) == 0 && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        signals.load(Ordering::SeqCst) >= 1,
        "no vault-changed event"
    );

    call("vault_watch_stop", json!({})).unwrap();
    std::thread::sleep(Duration::from_millis(500));
    let after_stop = signals.load(Ordering::SeqCst);
    std::fs::write(dir.join("later.md"), "x").unwrap();
    std::thread::sleep(Duration::from_millis(800));
    assert_eq!(signals.load(Ordering::SeqCst), after_stop);
    let _ = std::fs::remove_dir_all(&dir);
}
