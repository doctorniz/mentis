import {
  getFileSystemAdapter,
  createScopedAdapter,
  FsapiAdapter,
  isFsapiSupported,
  pickDirectoryFsapi,
  storeDirectoryHandle,
  getStoredDirectoryHandle,
  clearStoredDirectoryHandle,
} from '@/lib/fs'
import type { FileSystemAdapter } from '@/lib/fs'
import { bootstrapNewVault, loadVaultConfig, createVault, isVault } from '@/lib/vault'
import { discoverVaults } from '@/lib/vault/discover'
import { getStoredActiveVaultPath, setStoredActiveVaultPath } from '@/lib/vault/session-storage'
import type { VaultConfig } from '@/types/vault'

/**
 * Where vaults live and how one is opened, restored or closed. The landing
 * screen calls these and draws the result; it never picks a backend itself.
 *
 * Two kinds of vault exist today: folders in the browser's private storage
 * (id `vaults/<slug>`), and folders on disk opened through the File System
 * Access API (id `fsapi:<folder name>`). Those id formats live only here.
 */

export interface VaultSession {
  rootFs: FileSystemAdapter
  vaultFs: FileSystemAdapter
  vaultPath: string
  config: VaultConfig
}

export interface BrowserVault {
  path: string
  displayName: string
}

export type RestoreResult =
  | { status: 'opened'; session: VaultSession }
  | {
      status: 'needs-permission'
      folderName: string
      /** Must be called from a user gesture. Forgets the folder if it fails. */
      reconnect: () => Promise<VaultSession>
    }
  | { status: 'none' }

const FOLDER_ID_PREFIX = 'fsapi:'

function folderVaultId(handle: FileSystemDirectoryHandle): string {
  return `${FOLDER_ID_PREFIX}${handle.name}`
}

async function browserRoot(): Promise<FileSystemAdapter> {
  const root = await getFileSystemAdapter()
  await root.init()
  return root
}

/** Whether the user can open a vault from a folder on their disk. */
export function canOpenFolder(): boolean {
  return isFsapiSupported()
}

/** Vaults in the browser's private storage. */
export async function listBrowserVaults(): Promise<BrowserVault[]> {
  const list = await discoverVaults(await browserRoot())
  return list.map((v) => ({ path: v.path, displayName: v.displayName }))
}

export async function createBrowserVault(name: string): Promise<VaultSession> {
  const rootFs = await browserRoot()
  const { vaultPath, config } = await bootstrapNewVault(rootFs, name.trim() || 'My Vault')
  const vaultFs = createScopedAdapter(rootFs, vaultPath)
  setStoredActiveVaultPath(vaultPath)
  return { rootFs, vaultFs, vaultPath, config }
}

export async function openBrowserVault(path: string): Promise<VaultSession> {
  const rootFs = await browserRoot()
  const vaultFs = createScopedAdapter(rootFs, path)
  if (!(await isVault(vaultFs))) throw new Error('That folder is not a valid Mentis vault.')
  const config = await loadVaultConfig(vaultFs)
  setStoredActiveVaultPath(path)
  return { rootFs, vaultFs, vaultPath: path, config }
}

/** A folder without a vault in it becomes one. */
async function openFolderAdapter(fsapi: FsapiAdapter): Promise<VaultSession> {
  const handle = fsapi.directoryHandle
  const vaultPath = folderVaultId(handle)
  const config = (await isVault(fsapi))
    ? await loadVaultConfig(fsapi)
    : await createVault(fsapi, 'My Vault')
  setStoredActiveVaultPath(vaultPath)
  await storeDirectoryHandle(handle)
  return { rootFs: fsapi, vaultFs: fsapi, vaultPath, config }
}

/** Ask the user for a folder. Resolves to null if they cancel the picker. */
export async function openFolderVault(): Promise<VaultSession | null> {
  try {
    return await openFolderAdapter(await pickDirectoryFsapi())
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }
}

/** Forget which vault was open, so the next launch starts at the landing screen. */
export async function forgetLastVault(): Promise<void> {
  setStoredActiveVaultPath(null)
  await clearStoredDirectoryHandle().catch(() => {})
}

/**
 * Reopen the vault that was open last time, if there was one and it is still
 * usable. A stale record is cleared. Aborting `signal` stops it opening anything.
 */
export async function restoreLastVault(signal?: AbortSignal): Promise<RestoreResult> {
  const none: RestoreResult = { status: 'none' }
  const stored = getStoredActiveVaultPath()

  if (stored && !stored.startsWith(FOLDER_ID_PREFIX)) {
    const rootFs = await browserRoot()
    if (signal?.aborted) return none
    const vaultFs = createScopedAdapter(rootFs, stored)
    if (await isVault(vaultFs)) {
      const config = await loadVaultConfig(vaultFs)
      if (signal?.aborted) return none
      return { status: 'opened', session: { rootFs, vaultFs, vaultPath: stored, config } }
    }
    setStoredActiveVaultPath(null)
  }

  if (isFsapiSupported() && stored?.startsWith(FOLDER_ID_PREFIX)) {
    try {
      const handle = await getStoredDirectoryHandle()
      if (handle && !signal?.aborted) {
        const permission = await handle.queryPermission({ mode: 'readwrite' })
        if (permission === 'granted') {
          const fsapi = new FsapiAdapter(handle)
          await fsapi.init()
          if (signal?.aborted) return none
          return { status: 'opened', session: await openFolderAdapter(fsapi) }
        }
        if (permission === 'prompt') {
          return {
            status: 'needs-permission',
            folderName: handle.name,
            reconnect: async () => {
              try {
                const fsapi = new FsapiAdapter(handle)
                await fsapi.init()
                return await openFolderAdapter(fsapi)
              } catch (e) {
                await forgetLastVault()
                throw e
              }
            },
          }
        }
        await forgetLastVault()
      }
    } catch {
      await forgetLastVault()
    }
  }

  return none
}
