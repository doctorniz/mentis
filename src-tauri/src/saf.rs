//! Vaults in a folder picked through Android's Storage Access Framework. Such a
//! folder has no file path the app may use: it is a `content://` tree URI, and
//! every file in it is reached through Android's content resolver. The Kotlin
//! side (`SafPlugin.kt`) does that; this module is the Rust end of it.
//!
//! A vault root here is the tree URI, optionally followed by `|` and a folder
//! inside it (a vault created inside a picked parent folder). Reads and writes
//! do not pass the bytes through IPC: Kotlin opens the document and hands back
//! a file descriptor in this process.

use std::sync::Arc;

use serde::{Deserialize, Serialize};

/// Root strings of SAF vaults start with this.
pub const SCHEME: &str = "content://";

pub fn is_saf(root: &str) -> bool {
    root.starts_with(SCHEME)
}

/// The tree URI and the vault-relative path joined onto the root's own folder.
pub fn split(root: &str, rel: &str) -> (String, String) {
    let (tree, base) = root.split_once('|').unwrap_or((root, ""));
    let rel = rel.trim_matches('/');
    let path = match (base.trim_matches('/'), rel) {
        ("", r) => r.to_string(),
        (b, "") => b.to_string(),
        (b, r) => format!("{b}/{r}"),
    };
    (tree.to_string(), path)
}

/// Refuse segments that could step outside the vault or mean something else
/// to a document provider.
pub fn check_rel(rel: &str) -> Result<(), String> {
    for seg in rel.trim_matches('/').split('/').filter(|s| !s.is_empty()) {
        if seg == "." || seg == ".." || seg.contains('\\') || seg.contains('|') {
            return Err(format!("invalid vault path: {rel}"));
        }
    }
    Ok(())
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SafStat {
    pub is_directory: bool,
    pub size: u64,
    pub mtime: Option<f64>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SafEntry {
    pub name: String,
    #[serde(flatten)]
    pub stat: SafStat,
}

/// A folder the user picked: its root string and a name to show.
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Picked {
    pub root: String,
    pub name: String,
}

/// What the platform must provide for SAF vaults.
pub trait SafBackend: Send + Sync {
    fn pick_folder(&self) -> Result<Option<Picked>, String>;
    /// Pick a parent folder and create `name` in it.
    fn create_folder(&self, name: &str) -> Result<Option<Picked>, String>;
    fn stat(&self, tree: &str, path: &str) -> Result<Option<SafStat>, String>;
    fn list(&self, tree: &str, path: &str) -> Result<Vec<SafEntry>, String>;
    fn mkdirs(&self, tree: &str, path: &str) -> Result<(), String>;
    /// A file descriptor for `path`, opened for reading, or for writing
    /// (created, with its folders, and truncated).
    fn open_fd(&self, tree: &str, path: &str, write: bool) -> Result<i32, String>;
    fn rename(&self, tree: &str, from: &str, to: &str) -> Result<(), String>;
    /// A file, or a folder with everything in it.
    fn delete(&self, tree: &str, path: &str) -> Result<(), String>;
    /// Whether the app may still use the tree (the grant can be revoked).
    fn available(&self, tree: &str) -> bool;
}

/// The SAF backend, where the platform has one.
#[derive(Default, Clone)]
pub struct Saf(pub Option<Arc<dyn SafBackend>>);

impl Saf {
    pub fn get(&self) -> Result<&dyn SafBackend, String> {
        self.0
            .as_deref()
            .ok_or_else(|| "Picked folders are not supported on this platform.".to_string())
    }
}

/// Read a whole file through a descriptor from the backend.
#[cfg(unix)]
pub fn read(backend: &dyn SafBackend, tree: &str, path: &str) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut file = file_from(backend.open_fd(tree, path, false)?);
    let mut out = Vec::new();
    file.read_to_end(&mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

/// Replace a file's contents through a descriptor from the backend.
#[cfg(unix)]
pub fn write(backend: &dyn SafBackend, tree: &str, path: &str, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut file = file_from(backend.open_fd(tree, path, true)?);
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

#[cfg(unix)]
fn file_from(fd: i32) -> std::fs::File {
    use std::os::fd::FromRawFd;
    // SAFETY: the descriptor was detached for us by the Kotlin side and is
    // owned by nothing else; the File closes it.
    unsafe { std::fs::File::from_raw_fd(fd) }
}

#[cfg(not(unix))]
pub fn read(_: &dyn SafBackend, _: &str, _: &str) -> Result<Vec<u8>, String> {
    Err("Picked folders are not supported on this platform.".into())
}

#[cfg(not(unix))]
pub fn write(_: &dyn SafBackend, _: &str, _: &str, _: &[u8]) -> Result<(), String> {
    Err("Picked folders are not supported on this platform.".into())
}

#[cfg(target_os = "android")]
mod android {
    //! Picking a folder needs the activity, so it goes through the plugin.
    //! Everything else calls `SafStore` (Kotlin) directly over JNI from the
    //! calling thread: a plugin call is routed through Android's main thread,
    //! which serialises them and costs ~10 ms each.

    use std::sync::OnceLock;

    use jni::objects::{GlobalRef, JClass, JObject, JString, JValue};
    use jni::{JNIEnv, JavaVM};
    use serde_json::json;
    use tauri::Runtime;
    use tauri::plugin::PluginHandle;

    use super::*;

    pub struct AndroidSaf<R: Runtime>(pub PluginHandle<R>);

    #[derive(Deserialize)]
    struct MaybePicked {
        picked: Option<Picked>,
    }

    struct Jvm {
        vm: JavaVM,
        store: GlobalRef,
    }

    static JVM: OnceLock<Result<Jvm, String>> = OnceLock::new();

    /// The VM and `SafStore`, found once. The class is loaded through the
    /// app's class loader: on a thread Java did not start, `FindClass` only
    /// sees the system's classes.
    fn jvm() -> Result<&'static Jvm, String> {
        JVM.get_or_init(|| {
            let ctx = ndk_context::android_context();
            // SAFETY: tao initialises the context with the app's VM and activity.
            let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
            let store = {
                let mut env = vm
                    .attach_current_thread_permanently()
                    .map_err(|e| e.to_string())?;
                // SAFETY: a global reference held by ndk-context for the app's life.
                let context = unsafe { JObject::from_raw(ctx.context().cast()) };
                let load = |env: &mut JNIEnv| -> jni::errors::Result<GlobalRef> {
                    let loader = env
                        .call_method(&context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])?
                        .l()?;
                    let name = env.new_string("app.mentis.SafStore")?;
                    let class = env
                        .call_method(
                            &loader,
                            "loadClass",
                            "(Ljava/lang/String;)Ljava/lang/Class;",
                            &[JValue::Object(&name)],
                        )?
                        .l()?;
                    env.new_global_ref(class)
                };
                load(&mut env).map_err(|e| failure(&mut env, e))?
            };
            Ok(Jvm { vm, store })
        })
        .as_ref()
        .map_err(Clone::clone)
    }

    /// A Java exception's message, or the JNI error.
    fn failure(env: &mut JNIEnv, e: jni::errors::Error) -> String {
        if !matches!(e, jni::errors::Error::JavaException) {
            return e.to_string();
        }
        let Ok(ex) = env.exception_occurred() else {
            return e.to_string();
        };
        let _ = env.exception_clear();
        env.call_method(&ex, "getMessage", "()Ljava/lang/String;", &[])
            .and_then(|m| m.l())
            .ok()
            .filter(|m| !m.is_null())
            .and_then(|m| env.get_string(&JString::from(m)).ok().map(String::from))
            .unwrap_or_else(|| "the document provider failed".into())
    }

    /// Call `SafStore.name(args)` on this thread.
    fn call<T>(
        f: impl FnOnce(&mut JNIEnv, &JClass) -> jni::errors::Result<T>,
    ) -> Result<T, String> {
        let jvm = jvm()?;
        let mut env = jvm
            .vm
            .attach_current_thread_permanently()
            .map_err(|e| e.to_string())?;
        // SAFETY: the global reference is a java.lang.Class and lives forever.
        let class = unsafe { JClass::from_raw(jvm.store.as_obj().as_raw()) };
        let result = env.with_local_frame(16, |env| f(env, &class));
        result.map_err(|e| failure(&mut env, e))
    }

    fn strings<'a>(env: &mut JNIEnv<'a>, values: &[&str]) -> jni::errors::Result<Vec<JObject<'a>>> {
        values
            .iter()
            .map(|v| env.new_string(v).map(JObject::from))
            .collect()
    }

    fn string_result(env: &mut JNIEnv, value: JObject) -> jni::errors::Result<Option<String>> {
        if value.is_null() {
            return Ok(None);
        }
        Ok(Some(env.get_string(&JString::from(value))?.into()))
    }

    const S2_S: &str = "(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;";
    const S2_V: &str = "(Ljava/lang/String;Ljava/lang/String;)V";

    impl<R: Runtime> SafBackend for AndroidSaf<R> {
        fn pick_folder(&self) -> Result<Option<Picked>, String> {
            Ok(self
                .0
                .run_mobile_plugin::<MaybePicked>("pickFolder", json!({}))
                .map_err(|e| e.to_string())?
                .picked)
        }
        fn create_folder(&self, name: &str) -> Result<Option<Picked>, String> {
            Ok(self
                .0
                .run_mobile_plugin::<MaybePicked>("createFolder", json!({ "name": name }))
                .map_err(|e| e.to_string())?
                .picked)
        }
        fn stat(&self, tree: &str, path: &str) -> Result<Option<SafStat>, String> {
            let json = call(|env, class| {
                let a = strings(env, &[tree, path])?;
                let v = env
                    .call_static_method(
                        class,
                        "stat",
                        S2_S,
                        &[JValue::Object(&a[0]), JValue::Object(&a[1])],
                    )?
                    .l()?;
                string_result(env, v)
            })?;
            json.map(|j| serde_json::from_str(&j).map_err(|e| e.to_string()))
                .transpose()
        }
        fn list(&self, tree: &str, path: &str) -> Result<Vec<SafEntry>, String> {
            let json = call(|env, class| {
                let a = strings(env, &[tree, path])?;
                let v = env
                    .call_static_method(
                        class,
                        "list",
                        S2_S,
                        &[JValue::Object(&a[0]), JValue::Object(&a[1])],
                    )?
                    .l()?;
                string_result(env, v)
            })?
            .unwrap_or_else(|| "[]".into());
            serde_json::from_str(&json).map_err(|e| e.to_string())
        }
        fn mkdirs(&self, tree: &str, path: &str) -> Result<(), String> {
            call(|env, class| {
                let a = strings(env, &[tree, path])?;
                env.call_static_method(
                    class,
                    "mkdirs",
                    S2_V,
                    &[JValue::Object(&a[0]), JValue::Object(&a[1])],
                )?;
                Ok(())
            })
        }
        fn open_fd(&self, tree: &str, path: &str, write: bool) -> Result<i32, String> {
            call(|env, class| {
                let a = strings(env, &[tree, path])?;
                env.call_static_method(
                    class,
                    "openFd",
                    "(Ljava/lang/String;Ljava/lang/String;Z)I",
                    &[
                        JValue::Object(&a[0]),
                        JValue::Object(&a[1]),
                        JValue::Bool(write.into()),
                    ],
                )?
                .i()
            })
        }
        fn rename(&self, tree: &str, from: &str, to: &str) -> Result<(), String> {
            call(|env, class| {
                let a = strings(env, &[tree, from, to])?;
                env.call_static_method(
                    class,
                    "rename",
                    "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V",
                    &[
                        JValue::Object(&a[0]),
                        JValue::Object(&a[1]),
                        JValue::Object(&a[2]),
                    ],
                )?;
                Ok(())
            })
        }
        fn delete(&self, tree: &str, path: &str) -> Result<(), String> {
            call(|env, class| {
                let a = strings(env, &[tree, path])?;
                env.call_static_method(
                    class,
                    "delete",
                    S2_V,
                    &[JValue::Object(&a[0]), JValue::Object(&a[1])],
                )?;
                Ok(())
            })
        }
        fn available(&self, tree: &str) -> bool {
            call(|env, class| {
                let a = strings(env, &[tree])?;
                env.call_static_method(
                    class,
                    "available",
                    "(Ljava/lang/String;)Z",
                    &[JValue::Object(&a[0])],
                )?
                .z()
            })
            .unwrap_or(false)
        }
    }
}

/// The plugin that registers the Kotlin side and puts the backend in state.
#[cfg(mobile)]
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("saf")
        .setup(|app, api| {
            use tauri::Manager;
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin("app.mentis", "SafPlugin")?;
                app.manage(Saf(Some(Arc::new(android::AndroidSaf(handle)))));
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                app.manage(Saf::default());
            }
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_roots_with_and_without_a_folder_inside() {
        let tree = "content://com.android.externalstorage.documents/tree/primary%3ADocuments";
        assert_eq!(
            split(tree, "a/b.md"),
            (tree.to_string(), "a/b.md".to_string())
        );
        assert_eq!(split(tree, ""), (tree.to_string(), String::new()));
        let root = format!("{tree}|My Vault");
        assert_eq!(
            split(&root, "/a.md"),
            (tree.to_string(), "My Vault/a.md".to_string())
        );
        assert_eq!(split(&root, ""), (tree.to_string(), "My Vault".to_string()));
    }

    #[test]
    fn refuses_paths_that_step_out() {
        assert!(check_rel("notes/a.md").is_ok());
        assert!(check_rel("../a.md").is_err());
        assert!(check_rel("a/./b").is_err());
        assert!(check_rel("a|b").is_err());
    }

    #[test]
    fn a_platform_without_a_backend_says_so() {
        assert!(Saf::default().get().is_err());
        assert!(is_saf("content://x") && !is_saf("C:/Vault"));
    }
}
