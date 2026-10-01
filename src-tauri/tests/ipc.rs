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
