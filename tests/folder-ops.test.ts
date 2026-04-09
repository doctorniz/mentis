import { describe, it, expect, beforeEach } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry, FileStats } from '@/types/files'
import { FileType } from '@/types/files'
import { renameFolder, collectFilePaths } from '@/lib/notes/folder-ops'

class InMemoryAdapter implements FileSystemAdapter {
  readonly type = 'opfs' as const
  private files = new Map<string, Uint8Array>()
  private dirs = new Set<string>([''])

  async init() {}

  async readFile(path: string): Promise<Uint8Array> {
    const data = this.files.get(path)
    if (!data) throw new Error(`File not found: ${path}`)
    return data
  }

  async readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(path))
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, data)
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await this.writeFile(path, new TextEncoder().encode(content))
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path)
  }

  async stat(path: string): Promise<FileStats> {
    if (!this.files.has(path)) throw new Error(`Not found: ${path}`)
    const now = new Date()
    return { size: this.files.get(path)!.length, createdAt: now, modifiedAt: now }
  }

  async mkdir(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    let cur = ''
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p
      this.dirs.add(cur)
    }
  }

  async readdir(path: string): Promise<FileEntry[]> {
    const prefix = path ? path + '/' : ''
    const entries: FileEntry[] = []
    const seenDirs = new Set<string>()

    for (const fp of this.files.keys()) {
      if (!fp.startsWith(prefix)) continue
      const rest = fp.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) {
        entries.push({ name: rest, path: fp, isDirectory: false, type: FileType.Markdown })
      } else {
        const dirName = rest.slice(0, slash)
        const dirPath = prefix + dirName
        if (!seenDirs.has(dirPath)) {
          seenDirs.add(dirPath)
          entries.push({ name: dirName, path: dirPath, isDirectory: true, type: FileType.Other })
        }
      }
    }

    for (const d of this.dirs) {
      if (!d.startsWith(prefix) || d === path) continue
      const rest = d.slice(prefix.length)
      if (!rest.includes('/') && !seenDirs.has(d)) {
        seenDirs.add(d)
        entries.push({ name: rest, path: d, isDirectory: true, type: FileType.Other })
      }
    }

    return entries
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const data = this.files.get(oldPath)
    if (!data) throw new Error(`Not found: ${oldPath}`)
    this.files.delete(oldPath)
    this.files.set(newPath, data)
  }

  async copy(): Promise<void> {}

  async remove(path: string): Promise<void> {
    this.files.delete(path)
  }

  async removeDir(path: string): Promise<void> {
    const prefix = path + '/'
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix) || key === path) this.files.delete(key)
    }
    for (const d of [...this.dirs]) {
      if (d.startsWith(prefix) || d === path) this.dirs.delete(d)
    }
  }
}

describe('collectFilePaths', () => {
  let fs: InMemoryAdapter

  beforeEach(() => {
    fs = new InMemoryAdapter()
  })

  it('collects all files recursively', async () => {
    await fs.mkdir('notes')
    await fs.mkdir('notes/sub')
    await fs.writeTextFile('notes/a.md', 'a')
    await fs.writeTextFile('notes/sub/b.md', 'b')
    await fs.writeTextFile('notes/sub/c.md', 'c')

    const paths = await collectFilePaths(fs, 'notes')
    expect(paths).toContain('notes/a.md')
    expect(paths).toContain('notes/sub/b.md')
    expect(paths).toContain('notes/sub/c.md')
    expect(paths).toHaveLength(3)
  })

  it('returns empty array for empty folder', async () => {
    await fs.mkdir('empty')
    const paths = await collectFilePaths(fs, 'empty')
    expect(paths).toEqual([])
  })
})

describe('renameFolder', () => {
  let fs: InMemoryAdapter

  beforeEach(() => {
    fs = new InMemoryAdapter()
  })

  it('renames a flat folder', async () => {
    await fs.mkdir('old')
    await fs.writeTextFile('old/note.md', '# Hello')

    await renameFolder(fs, 'old', 'new')

    expect(await fs.exists('new/note.md')).toBe(true)
    expect(await fs.readTextFile('new/note.md')).toBe('# Hello')
    expect(await fs.exists('old/note.md')).toBe(false)
  })

  it('renames a nested folder preserving structure', async () => {
    await fs.mkdir('a/b')
    await fs.writeTextFile('a/x.md', 'x')
    await fs.writeTextFile('a/b/y.md', 'y')

    await renameFolder(fs, 'a', 'c')

    expect(await fs.exists('c/x.md')).toBe(true)
    expect(await fs.exists('c/b/y.md')).toBe(true)
    expect(await fs.readTextFile('c/x.md')).toBe('x')
    expect(await fs.readTextFile('c/b/y.md')).toBe('y')
    expect(await fs.exists('a')).toBe(false)
  })

  it('no-ops when old and new paths are the same', async () => {
    await fs.mkdir('same')
    await fs.writeTextFile('same/f.md', 'content')
    await renameFolder(fs, 'same', 'same')
    expect(await fs.exists('same/f.md')).toBe(true)
  })

  it('preserves file content for binary data', async () => {
    await fs.mkdir('bin')
    const data = new Uint8Array([0, 1, 2, 255])
    await fs.writeFile('bin/data.bin', data)

    await renameFolder(fs, 'bin', 'moved')

    const read = await fs.readFile('moved/data.bin')
    expect([...read]).toEqual([0, 1, 2, 255])
  })
})
