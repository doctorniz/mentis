import { FileType, getFileType } from '@/types/files'
import type { FileEntry, FileStats } from '@/types/files'
import type { FileSystemAdapter } from './types'

/**
 * File System Access API adapter — wraps a user-picked directory handle.
 * Works only in Chromium browsers that support `window.showDirectoryPicker()`.
 * Unlike OPFS, this gives read/write access to a real folder on the user's disk.
 */
export class FsapiAdapter implements FileSystemAdapter {
  readonly type = 'fsapi' as const
  private root: FileSystemDirectoryHandle

  constructor(directoryHandle: FileSystemDirectoryHandle) {
    this.root = directoryHandle
  }

  /** The underlying handle — needed for IndexedDB persistence. */
  get directoryHandle(): FileSystemDirectoryHandle {
    return this.root
  }

  async init(): Promise<void> {
    const perm = await this.root.queryPermission({ mode: 'readwrite' })
    if (perm !== 'granted') {
      const req = await this.root.requestPermission({ mode: 'readwrite' })
      if (req !== 'granted') {
        throw new Error('Read/write permission denied for the selected folder.')
      }
    }
  }

  private async resolvePath(
    path: string,
  ): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
    const segments = path.split('/').filter(Boolean)
    const name = segments.pop()
    if (!name) throw new Error(`Invalid path: ${path}`)

    let dir = this.root
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment)
    }
    return { parent: dir, name }
  }

  private async resolveDir(path: string): Promise<FileSystemDirectoryHandle> {
    const segments = path.split('/').filter(Boolean)
    let dir = this.root
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment)
    }
    return dir
  }

  async readFile(path: string): Promise<Uint8Array> {
    const { parent, name } = await this.resolvePath(path)
    const fh = await parent.getFileHandle(name)
    const file = await fh.getFile()
    return new Uint8Array(await file.arrayBuffer())
  }

  async readTextFile(path: string): Promise<string> {
    const { parent, name } = await this.resolvePath(path)
    const fh = await parent.getFileHandle(name)
    const file = await fh.getFile()
    return file.text()
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const { parent, name } = await this.resolvePath(path)
    const fh = await parent.getFileHandle(name, { create: true })
    const writable = await fh.createWritable()
    await writable.write(data.buffer as ArrayBuffer)
    await writable.close()
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await this.writeFile(path, new TextEncoder().encode(content))
  }

  async exists(path: string): Promise<boolean> {
    try {
      const { parent, name } = await this.resolvePath(path)
      try {
        await parent.getFileHandle(name)
        return true
      } catch {
        await parent.getDirectoryHandle(name)
        return true
      }
    } catch {
      return false
    }
  }

  async stat(path: string): Promise<FileStats> {
    const { parent, name } = await this.resolvePath(path)
    const fh = await parent.getFileHandle(name)
    const file = await fh.getFile()
    return {
      size: file.size,
      createdAt: new Date(file.lastModified),
      modifiedAt: new Date(file.lastModified),
    }
  }

  async mkdir(path: string): Promise<void> {
    const segments = path.split('/').filter(Boolean)
    let dir = this.root
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, { create: true })
    }
  }

  async readdir(path: string): Promise<FileEntry[]> {
    const dir = path ? await this.resolveDir(path) : this.root
    const entries: FileEntry[] = []

    for await (const [name, handle] of dir.entries()) {
      const entryPath = path ? `${path}/${name}` : name
      const isDirectory = handle.kind === 'directory'

      const entry: FileEntry = {
        name,
        path: entryPath,
        type: isDirectory ? FileType.Other : getFileType(name),
        isDirectory,
      }

      if (!isDirectory) {
        try {
          const file = await (handle as FileSystemFileHandle).getFile()
          entry.size = file.size
          entry.modifiedAt = new Date(file.lastModified).toISOString()
        } catch {
          /* stat errors non-fatal */
        }
      }

      entries.push(entry)
    }

    return entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (oldPath === newPath) return

    const oldResolved = await this.resolvePath(oldPath)
    const newResolved = await this.resolvePath(newPath)

    type WithMove = { move?: (dest: FileSystemDirectoryHandle, name: string) => Promise<void> }

    let handle: FileSystemFileHandle | FileSystemDirectoryHandle
    let isDir = false
    try {
      handle = await oldResolved.parent.getFileHandle(oldResolved.name)
    } catch {
      handle = await oldResolved.parent.getDirectoryHandle(oldResolved.name)
      isDir = true
    }

    const h = handle as unknown as WithMove
    if (typeof h.move === 'function') {
      try {
        await h.move(newResolved.parent, newResolved.name)
        return
      } catch { /* fall through to manual copy */ }
    }

    if (isDir) {
      await this.copyDirRecursive(oldPath, newPath)
      await this.removeDir(oldPath)
    } else {
      const data = await this.readFile(oldPath)
      await this.writeFile(newPath, data)
      await this.remove(oldPath)
    }
  }

  private async copyDirRecursive(src: string, dest: string): Promise<void> {
    await this.mkdir(dest)
    const entries = await this.readdir(src)
    for (const entry of entries) {
      const srcChild = entry.path
      const destChild = dest + '/' + entry.name
      if (entry.isDirectory) {
        await this.copyDirRecursive(srcChild, destChild)
      } else {
        const data = await this.readFile(srcChild)
        await this.writeFile(destChild, data)
      }
    }
  }

  async copy(src: string, dest: string): Promise<void> {
    const data = await this.readFile(src)
    await this.writeFile(dest, data)
  }

  async remove(path: string): Promise<void> {
    const { parent, name } = await this.resolvePath(path)
    await parent.removeEntry(name)
  }

  async removeDir(path: string): Promise<void> {
    const { parent, name } = await this.resolvePath(path)
    await parent.removeEntry(name, { recursive: true })
  }
}

/** Feature-detect whether the File System Access API is available (Chromium). */
export function isFsapiSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/** Prompt the user to pick a folder and return a ready adapter. */
export async function pickDirectoryFsapi(): Promise<FsapiAdapter> {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API is not supported in this browser.')
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  const adapter = new FsapiAdapter(handle)
  await adapter.init()
  return adapter
}
