// Builds and links the Swift side (`ios/`) when the target is iOS.
fn main() {
    tauri_plugin::Builder::new(&[]).ios_path("ios").build();
}
