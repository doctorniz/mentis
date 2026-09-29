import type { FileSystemAdapter } from './types'
import { OpfsAdapter } from './opfs'

export type { FileSystemAdapter } from './types'
export { ok, err } from './types'
export type { Result } from './types'
export { createScopedAdapter } from './scoped'
export { FsapiAdapter, isFsapiSupported, pickDirectoryFsapi } from './fsapi'
export {
  storeDirectoryHandle,
  getStoredDirectoryHandle,
  clearStoredDirectoryHandle,
} from './handle-store'

let adapter: FileSystemAdapter | null = null

/** The one place the app's own storage backend is chosen. A Tauri build returns its adapter here. */
export async function getFileSystemAdapter(): Promise<FileSystemAdapter> {
  if (adapter) return adapter

  adapter = new OpfsAdapter()
  await adapter.init()
  return adapter
}

export function resetAdapter(): void {
  adapter = null
}
