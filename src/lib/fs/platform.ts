/** Whether the app is running inside the Tauri shell (desktop or mobile). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Whether the app is the desktop app: the shell, and not on a phone. */
export function isDesktopApp(): boolean {
  return isTauri() && !__MENTIS_MOBILE__
}
