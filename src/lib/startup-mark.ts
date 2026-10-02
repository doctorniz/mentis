import { isTauri } from '@/lib/fs/platform'

/**
 * Tells the desktop shell the app shell is on screen. The shell uses it only
 * when CI asks it to time a cold start; otherwise it does nothing. Loaded
 * lazily so the web build never pulls in the Tauri API for this.
 */
export async function markShellReady(): Promise<void> {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('startup_ready')
  } catch {
    /* measurement only */
  }
}
