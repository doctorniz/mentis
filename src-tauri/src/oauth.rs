//! Sign-in for cloud sync from the desktop app: the system browser does the
//! consent step and redirects back to a one-shot listener on 127.0.0.1, so the
//! provider's page never loads inside the app window (RFC 8252, loopback).
//!
//! The window builds the authorize URL (it owns the PKCE verifier) and gets the
//! authorization code back; it then exchanges the code itself.

use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;

/// Registered in the Dropbox app console as `http://127.0.0.1:53682/auth/dropbox`.
pub const PORT: u16 = 53682;
const PATH: &str = "/auth/dropbox";
const REDIRECT_URI: &str = "http://127.0.0.1:53682/auth/dropbox";
const AUTHORIZE_PREFIX: &str = "https://www.dropbox.com/oauth2/authorize?";
const WAIT: Duration = Duration::from_secs(180);
const POLL: Duration = Duration::from_millis(50);

/// What the provider sent back: a code, or the reason there is none.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct Outcome {
    pub code: Option<String>,
    pub error: Option<String>,
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
                match hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                    Some(b) => {
                        out.push(b);
                        i += 2;
                    }
                    None => out.push(b'%'),
                }
            }
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn query_param(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        (percent_decode(k) == name).then(|| percent_decode(v))
    })
}

/// The request target of a `GET` request line, split into path and query.
fn request_target(head: &str) -> Option<(&str, &str)> {
    let line = head.lines().next()?;
    let mut parts = line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    let target = parts.next()?;
    Some(target.split_once('?').unwrap_or((target, "")))
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let msg = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(msg.as_bytes());
}

fn page(text: &str) -> String {
    format!(
        "<!doctype html><meta charset=utf-8><title>Mentis</title>\
         <body style=\"font-family:system-ui,sans-serif;text-align:center;margin-top:20vh\">\
         <p>{text}</p>"
    )
}

/// Serves the listener until the provider's redirect arrives, `cancel` is set
/// or `wait` runs out. Requests for anything else get a 404; a redirect whose
/// `state` differs from `expected_state` is refused and ignored.
fn await_callback(
    listener: &TcpListener,
    expected_state: &str,
    wait: Duration,
    cancel: &AtomicBool,
) -> Result<Outcome, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let until = Instant::now() + wait;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err("sign-in was cancelled".into());
        }
        if Instant::now() >= until {
            return Err("sign-in timed out; try connecting again".into());
        }
        let mut stream = match listener.accept() {
            Ok((stream, _)) => stream,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(POLL);
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let mut buf = [0u8; 8192];
        let n = stream.read(&mut buf).unwrap_or(0);
        let head = String::from_utf8_lossy(&buf[..n]).into_owned();
        let Some((path, query)) = request_target(&head) else {
            respond(&mut stream, "400 Bad Request", &page("Bad request."));
            continue;
        };
        if path != PATH {
            respond(&mut stream, "404 Not Found", &page("Not found."));
            continue;
        }
        if query_param(query, "state").as_deref() != Some(expected_state) {
            respond(
                &mut stream,
                "400 Bad Request",
                &page("This sign-in link does not match the request Mentis made."),
            );
            continue;
        }
        let code = query_param(query, "code").filter(|c| !c.is_empty());
        let error = query_param(query, "error_description")
            .or_else(|| query_param(query, "error"))
            .filter(|e| !e.is_empty());
        let text = if code.is_some() {
            "Signed in. You can close this tab and return to Mentis."
        } else {
            "Sign-in did not complete. You can close this tab and return to Mentis."
        };
        respond(&mut stream, "200 OK", &page(text));
        return Ok(Outcome { code, error });
    }
}

/// Binds the loopback port, retrying briefly so a replaced attempt can let go.
fn bind() -> Result<TcpListener, String> {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, PORT));
    let mut last = None;
    for _ in 0..20 {
        match TcpListener::bind(addr) {
            Ok(l) => return Ok(l),
            Err(e) => {
                last = Some(e);
                thread::sleep(Duration::from_millis(50));
            }
        }
    }
    Err(format!(
        "cannot listen on 127.0.0.1:{PORT} for the sign-in redirect (is another program using it?): {}",
        last.map(|e| e.to_string()).unwrap_or_default()
    ))
}

/// Whether `url` is the provider's authorize page asking for our redirect.
fn is_expected_authorize_url(url: &str) -> bool {
    url.strip_prefix(AUTHORIZE_PREFIX)
        .and_then(|query| query_param(query, "redirect_uri"))
        .is_some_and(|r| r == REDIRECT_URI)
}

/// The attempt in progress, so starting another one replaces it.
#[derive(Default)]
pub struct OAuthAttempt(Mutex<Option<Arc<AtomicBool>>>);

#[tauri::command]
pub async fn oauth_authorize(
    attempt: State<'_, OAuthAttempt>,
    auth_url: String,
    state: String,
) -> Result<Outcome, String> {
    if state.len() < 16 {
        return Err("sign-in state is too short".into());
    }
    if !is_expected_authorize_url(&auth_url) {
        return Err("refusing to open an unexpected sign-in address".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    if let Some(previous) = attempt
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .replace(Arc::clone(&cancel))
    {
        previous.store(true, Ordering::SeqCst);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let listener = bind()?;
        tauri_plugin_opener::open_url(&auth_url, None::<&str>)
            .map_err(|e| format!("cannot open the browser: {e}"))?;
        await_callback(&listener, &state, WAIT, &cancel)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get(port: u16, target: &str) -> String {
        let mut s = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
        write!(s, "GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        out
    }

    fn serve(
        state: &'static str,
        wait: Duration,
    ) -> (
        u16,
        Arc<AtomicBool>,
        thread::JoinHandle<Result<Outcome, String>>,
    ) {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let cancel = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&cancel);
        let handle = thread::spawn(move || await_callback(&listener, state, wait, &flag));
        (port, cancel, handle)
    }

    const STATE: &str = "0123456789abcdef";

    #[test]
    fn decodes_percent_escapes() {
        assert_eq!(percent_decode("a%20b+c%2Fd"), "a b c/d");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz%4"), "%zz%4");
        assert_eq!(percent_decode("%E2%9C%93"), "\u{2713}");
    }

    #[test]
    fn reads_query_parameters() {
        assert_eq!(
            query_param("a=1&code=x%2By&b=2", "code").as_deref(),
            Some("x+y")
        );
        assert_eq!(query_param("a=1", "code"), None);
        assert_eq!(query_param("flag", "flag").as_deref(), Some(""));
    }

    #[test]
    fn only_our_authorize_url_is_opened() {
        let ok = format!(
            "{AUTHORIZE_PREFIX}client_id=k&redirect_uri={}",
            "http%3A%2F%2F127.0.0.1%3A53682%2Fauth%2Fdropbox"
        );
        assert!(is_expected_authorize_url(&ok));
        assert!(!is_expected_authorize_url(
            "https://evil.example/oauth2/authorize?redirect_uri=x"
        ));
        assert!(!is_expected_authorize_url(
            "file:///c:/windows/system32/calc.exe"
        ));
        assert!(!is_expected_authorize_url(&format!(
            "{AUTHORIZE_PREFIX}redirect_uri=http%3A%2F%2Fexample.com%2F"
        )));
    }

    #[test]
    fn a_matching_redirect_returns_the_code() {
        let (port, _cancel, handle) = serve(STATE, Duration::from_secs(10));
        let reply = get(port, &format!("{PATH}?code=abc%2F123&state={STATE}"));
        assert!(reply.starts_with("HTTP/1.1 200"));
        assert!(reply.contains("Signed in"));
        let outcome = handle.join().unwrap().unwrap();
        assert_eq!(outcome.code.as_deref(), Some("abc/123"));
        assert_eq!(outcome.error, None);
    }

    #[test]
    fn a_denied_sign_in_returns_the_reason() {
        let (port, _cancel, handle) = serve(STATE, Duration::from_secs(10));
        get(
            port,
            &format!("{PATH}?error=access_denied&error_description=The+user+said+no&state={STATE}"),
        );
        let outcome = handle.join().unwrap().unwrap();
        assert_eq!(outcome.code, None);
        assert_eq!(outcome.error.as_deref(), Some("The user said no"));
    }

    #[test]
    fn stray_and_forged_requests_are_ignored() {
        let (port, _cancel, handle) = serve(STATE, Duration::from_secs(10));
        assert!(get(port, "/favicon.ico").starts_with("HTTP/1.1 404"));
        assert!(get(port, &format!("{PATH}?code=forged&state=wrong")).starts_with("HTTP/1.1 400"));
        assert!(get(port, &format!("{PATH}?code=forged")).starts_with("HTTP/1.1 400"));
        get(port, &format!("{PATH}?code=real&state={STATE}"));
        assert_eq!(
            handle.join().unwrap().unwrap().code.as_deref(),
            Some("real")
        );
    }

    #[test]
    fn waiting_ends_on_timeout_or_cancel() {
        let (_port, _cancel, handle) = serve(STATE, Duration::from_millis(150));
        assert!(handle.join().unwrap().unwrap_err().contains("timed out"));

        let (_port, cancel, handle) = serve(STATE, Duration::from_secs(30));
        cancel.store(true, Ordering::SeqCst);
        assert!(handle.join().unwrap().unwrap_err().contains("cancelled"));
    }
}
