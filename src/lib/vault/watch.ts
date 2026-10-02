import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { DESKTOP_ID_PREFIX } from '@/lib/vault/desktop'

/**
 * Watches an open desktop vault for changes made outside the app and calls
 * `onChange` (once per burst; the shell coalesces them). Resolves to a function
 * that stops watching, or to null if this is not a desktop vault or the folder
 * cannot be watched — the scan at open and the in-app change events still work.
 * Loaded only inside Tauri.
 */
export async function watchDesktopVault(
  vaultPath: string,
  onChange: () => void,
): Promise<(() => void) | null> {
  if (!vaultPath.startsWith(DESKTOP_ID_PREFIX)) return null
  const root = vaultPath.slice(DESKTOP_ID_PREFIX.length)
  const unlisten = await listen('vault-changed', onChange)
  try {
    await invoke('vault_watch_start', { root })
  } catch {
    unlisten()
    return null
  }
  return () => {
    unlisten()
    void invoke('vault_watch_stop').catch(() => {})
  }
}
