//! API keys in the operating system's credential store: Credential Manager on
//! Windows, the Keychain on macOS, the Secret Service (GNOME Keyring, KWallet)
//! on Linux. One entry per name, per user of this machine; the OS encrypts it
//! under the login. Nothing is written to the vault or to a file of ours.
//!
//! The web app and the phone apps keep keys another way (`src/lib/chat/key-store.ts`).

use keyring::Entry;

const SERVICE: &str = "app.mentis.llm-keys";

/// Only chat keys live here: the page cannot use this as a general safe.
fn entry(name: &str) -> Result<Entry, String> {
    let ok = name.starts_with("llm:")
        && name.len() <= 64
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b':' | b'-' | b'_' | b'.'));
    if !ok {
        return Err("invalid secret name".into());
    }
    Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

/// The saved secret, or none where nothing was saved.
#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    entry(&name)?
        .set_password(&value)
        .map_err(|e| e.to_string())
}

/// Forgets the secret; none saved is not an error.
#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_chat_key_names_are_accepted() {
        for ok in ["llm:openai", "llm:openrouter", "llm:llamacpp"] {
            assert!(entry(ok).is_ok(), "{ok}");
        }
        for bad in [
            "",
            "openai",
            "llm",
            "other:openai",
            "llm:a b",
            "llm:../x",
            &format!("llm:{}", "a".repeat(80)),
        ] {
            assert!(entry(bad).is_err(), "{bad}");
        }
    }

    /// Talks to the real credential store, which a CI machine may not have:
    /// `cargo test -- --ignored` on a desktop.
    #[test]
    #[ignore]
    fn a_secret_round_trips_through_the_os_store() {
        let name = "llm:mentis-test-roundtrip".to_string();
        let _ = secret_delete(name.clone());
        assert_eq!(secret_get(name.clone()).unwrap(), None);
        secret_set(name.clone(), "sk-test-123".into()).unwrap();
        assert_eq!(
            secret_get(name.clone()).unwrap().as_deref(),
            Some("sk-test-123")
        );
        secret_set(name.clone(), "sk-test-456".into()).unwrap();
        assert_eq!(
            secret_get(name.clone()).unwrap().as_deref(),
            Some("sk-test-456")
        );
        secret_delete(name.clone()).unwrap();
        assert_eq!(secret_get(name.clone()).unwrap(), None);
        secret_delete(name).unwrap();
    }
}
