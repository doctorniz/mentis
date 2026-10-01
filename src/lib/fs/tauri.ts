import { invoke } from '@tauri-apps/api/core'
import { FileType, getFileType } from '@/types/files'
import type { FileEntry, FileStats } from '@/types/files'
import type { FileSystemAdapter } from './types'

/** What the Rust side reports for a file or folder. Times are ms since epoch. */
interface NativeStat {
  size: number
  isDirectory: boolean
  mtime: number | null
  birthtime: number | null
}

interface NativeDirEntry extends NativeStat {
  name: string
}

function join(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

/**
 * A vault folder on the user's disk, reached through the desktop shell's
 * `vault_*` commands (src-tauri/src/vault_fs.rs). Paths are vault-relative
 * with `/` separators, as in every other adapter; the shell refuses any path
 * that would leave the folder, and any folder the user has not opened.
 *
 * Only imported when running in Tauri, so the web build never loads it.
 */
export class TauriFsAdapter implements FileSystemAdapter {
  readonly type = 'tauri' as const

  /** `root` is the vault folder's absolute path, as granted by the shell. */
  constructor(readonly root: string) {}

  async init(): Promise<void> {
    if (!(await this.exists(''))) throw new Error(`The folder ${this.root} is not available.`)
  }

  async readFile(path: string): Promise<Uint8Array> {
    const bytes = await invoke<ArrayBuffer>('vault_read', { root: this.root, path })
    return new Uint8Array(bytes)
  }

  async readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(path))
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    await invoke('vault_write', data, {
      headers: {
        'x-vault-root': encodeURIComponent(this.root),
        'x-vault-path': encodeURIComponent(path),
      },
    })
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await this.writeFile(path, new TextEncoder().encode(content))
  }

  exists(path: string): Promise<boolean> {
    return invoke<boolean>('vault_exists', { root: this.root, path })
  }

  async stat(path: string): Promise<FileStats> {
    const s = await invoke<NativeStat>('vault_stat', { root: this.root, path })
    const modified = s.mtime ?? 0
    return {
      size: s.size,
      createdAt: new Date(s.birthtime ?? modified),
      modifiedAt: new Date(modified),
    }
  }

  async mkdir(path: string): Promise<void> {
    await invoke('vault_mkdir', { root: this.root, path })
  }

  async readdir(path: string): Promise<FileEntry[]> {
    const raw = await invoke<NativeDirEntry[]>('vault_read_dir', { root: this.root, path })
    const entries = raw.map((e): FileEntry => {
      const entry: FileEntry = {
        name: e.name,
        path: join(path, e.name),
        type: e.isDirectory ? FileType.Other : getFileType(e.name),
        isDirectory: e.isDirectory,
      }
      if (!e.isDirectory) {
        entry.size = e.size
        if (e.mtime !== null) entry.modifiedAt = new Date(e.mtime).toISOString()
      }
      if (e.birthtime !== null) entry.createdAt = new Date(e.birthtime).toISOString()
      return entry
    })
    return entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (oldPath === newPath) return
    await invoke('vault_rename', { root: this.root, from: oldPath, to: newPath })
  }

  async copy(sourcePath: string, destPath: string): Promise<void> {
    await invoke('vault_copy', { root: this.root, from: sourcePath, to: destPath })
  }

  async remove(path: string): Promise<void> {
    await invoke('vault_remove', { root: this.root, path })
  }

  async removeDir(path: string): Promise<void> {
    await invoke('vault_remove_dir', { root: this.root, path })
  }
}
