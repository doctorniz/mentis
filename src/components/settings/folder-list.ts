import type { FileSystemAdapter } from '@/lib/fs/types'

/**
 * Every folder in the vault for the folder fields, as `'/'`, `'/Notes'`, …,
 * skipping dot-folders. It includes the hidden system folders the file tree
 * and index leave out (`_mentis/templates` is a common choice), so it reads
 * the disk. The walk runs once per dialog opening and is shared by every
 * folder field; `resetFolderList` starts a fresh one.
 */
let cached: { fs: FileSystemAdapter; folders: Promise<string[]> } | null = null

export function resetFolderList(): void {
  cached = null
}

export function listVaultFolders(vaultFs: FileSystemAdapter): Promise<string[]> {
  if (cached?.fs !== vaultFs) cached = { fs: vaultFs, folders: walkFolders(vaultFs) }
  return cached.folders
}

async function walkFolders(vaultFs: FileSystemAdapter): Promise<string[]> {
  const result: string[] = ['/']
  async function walk(dir: string) {
    try {
      for (const e of await vaultFs.readdir(dir)) {
        if (!e.isDirectory || e.name.startsWith('.')) continue
        const p = dir === '/' ? `/${e.name}` : `${dir}/${e.name}`
        result.push(p)
        await walk(p)
      }
    } catch {
      /* unreadable folder: skip it */
    }
  }
  await walk('/')
  return result
}
