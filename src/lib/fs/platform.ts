/** Whether the app is running inside the Tauri shell (desktop or mobile). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Whether the app is the desktop app: the shell, and not on a phone. */
export function isDesktopApp(): boolean {
  return isTauri() && !__MENTIS_MOBILE__
}

/**
 * Whether the app is the iPhone or iPad app. Mobile builds are one bundle for
 * Android and iOS, so the platform comes from the web view: iPadOS reports a
 * Mac, but only a touch screen has more than one touch point.
 */
export function isIosApp(): boolean {
  if (!isTauri() || !__MENTIS_MOBILE__) return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
