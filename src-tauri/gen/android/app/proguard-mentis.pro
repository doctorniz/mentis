# SafStore's functions are called from Rust over JNI (src-tauri/src/saf.rs),
# which R8 cannot see: keep them, with their names.
-keep class app.mentis.SafStore { *; }
