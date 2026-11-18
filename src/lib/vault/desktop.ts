import { invoke } from '@tauri-apps/api/core'
import { TauriFsAdapter } from '@/lib/fs/tauri'
import { createVault, isVault, loadVaultConfig, saveVaultConfig } from '@/lib/vault'
import { setStoredActiveVaultPath } from '@/lib/vault/session-storage'
import type { VaultSession } from '@/lib/vault/session'

/**
 * Vaults in the desktop app: folders on disk, chosen through the native
 * dialog and remembered in a recent list by the shell
 * (src-tauri/src/vaults.rs). Loaded only inside Tauri.
 */

export const DESKTOP_ID_PREFIX = 'tauri:'

export interface RecentVault {
  /** Absolute folder path. */
  path: string
  /** Folder name. */
  name: string
  /** False when the folder has been moved, deleted or is on a missing drive. */
  available: boolean
}

/**
 * The folder's name. On Android a vault is a Storage Access Framework tree,
 * `content://…/tree/primary%3ANotes%2FWork`, or `<tree>|<name>` for a folder
 * made inside one (SafPlugin.kt): the name is the last part of the decoded id.
 */
export function folderName(path: string): string {
  if (path.startsWith('content://')) {
    const made = path.lastIndexOf('|')
    if (made >= 0) return path.slice(made + 1).split('/').filter(Boolean).pop() || 'Vault'
    const last = path.split('/').filter(Boolean).pop() ?? ''
    let id = last
    try {
      id = decodeURIComponent(last)
    } catch {
      // keep it as it is
    }
    const inVolume = id.slice(id.indexOf(':') + 1)
    return inVolume.split('/').filter(Boolean).pop() || 'Vault'
  }
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/** Opens the vault at `root`; a folder without a vault in it becomes one called `name`. */
async function openAt(root: string, name: string): Promise<VaultSession> {
  const fs = new TauriFsAdapter(root)
  await fs.init()
  let config = (await isVault(fs)) ? await loadVaultConfig(fs) : await createVault(fs, name)
  // 0.1.3 and earlier named an Android vault after its encoded address.
  if (/%3A/i.test(config.name) && root.startsWith('content://')) {
    config = { ...config, name: folderName(root) }
    await saveVaultConfig(fs, config).catch(() => {})
  }
  const vaultPath = `${DESKTOP_ID_PREFIX}${root}`
  setStoredActiveVaultPath(vaultPath)
  return { rootFs: fs, vaultFs: fs, vaultPath, config }
}

/** The vault CI's cold-start measurement asks to open, if any (src-tauri/src/startup.rs). */
export function startupVault(): Promise<string | null> {
  return invoke<string | null>('startup_vault').catch(() => null)
}

export function listRecentVaults(): Promise<RecentVault[]> {
  return invoke<RecentVault[]>('vault_recent')
}

/** Asks for a folder. Resolves to null if the user cancels. */
export async function pickFolderVault(): Promise<VaultSession | null> {
  const root = await invoke<string | null>('vault_pick_folder')
  return root ? openAt(root, folderName(root)) : null
}

/** Asks where to put a new folder called `name` and makes it a vault. Null if cancelled. */
export async function createFolderVault(name: string): Promise<VaultSession | null> {
  const vaultName = name.trim() || 'My Vault'
  const root = await invoke<string | null>('vault_create', { name: vaultName })
  return root ? openAt(root, vaultName) : null
}

export async function openRecentVault(path: string): Promise<VaultSession> {
  const root = await invoke<string>('vault_open_recent', { path })
  return openAt(root, folderName(root))
}

/** Drops a folder from the recent list. The folder is not touched. */
export async function forgetRecentVault(path: string): Promise<void> {
  await invoke('vault_forget', { path })
}
