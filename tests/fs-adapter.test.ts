import { describe, it, expect, beforeEach } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry, FileStats } from '@/types/files'
import { FileType } from '@/types/files'

/**
 * In-memory FileSystemAdapter for testing the adapter contract
 * without needing OPFS or FSAPI browser APIs.
 */
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
    const data = await this.readFile(path)
    return new TextDecoder().decode(data)
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.ensureParent(path)
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
    return {
      size: this.files.get(path)!.length,
      createdAt: now,
      modifiedAt: now,
    }
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path)
  }

  async readdir(path: string): Promise<FileEntry[]> {
    const prefix = path ? path + '/' : ''
    const entries: FileEntry[] = []
    const seen = new Set<string>()

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) continue
      const rest = filePath.slice(prefix.length)
      const slashIdx = rest.indexOf('/')
      if (slashIdx === -1) {
        entries.push({
          name: rest,
          path: filePath,
          isDirectory: false,
          type: this.guessType(rest),
        })
      } else {
        const dirName = rest.slice(0, slashIdx)
        const dirPath = prefix + dirName
        if (!seen.has(dirPath)) {
          seen.add(dirPath)
          entries.push({ name: dirName, path: dirPath, isDirectory: true, type: FileType.Other })
        }
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

  async copy(src: string, dest: string): Promise<void> {
    const data = this.files.get(src)
    if (!data) throw new Error(`Not found: ${src}`)
    this.files.set(dest, new Uint8Array(data))
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path)
  }

  async removeDir(path: string): Promise<void> {
    const prefix = path + '/'
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) this.files.delete(key)
    }
    this.dirs.delete(path)
  }

  private ensureParent(path: string) {
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) {
      this.dirs.add(parts.slice(0, i).join('/'))
    }
  }

  private guessType(name: string): FileType {
    if (name.endsWith('.md')) return FileType.Markdown
    if (name.endsWith('.pdf')) return FileType.Pdf
    if (name.endsWith('.canvas')) return FileType.Canvas
    return FileType.Other
  }
}

describe('FileSystemAdapter (InMemory)', () => {
  let fs: InMemoryAdapter

  beforeEach(() => {
    fs = new InMemoryAdapter()
  })

  it('writeTextFile + readTextFile round-trip', async () => {
    await fs.writeTextFile('hello.txt', 'Hello World')
    const text = await fs.readTextFile('hello.txt')
    expect(text).toBe('Hello World')
  })

  it('writeFile + readFile round-trip (binary)', async () => {
    const data = new Uint8Array([0, 1, 2, 3, 255])
    await fs.writeFile('binary.dat', data)
    const read = await fs.readFile('binary.dat')
    expect(read).toEqual(data)
  })

  it('exists returns true for files', async () => {
    await fs.writeTextFile('a.txt', 'a')
    expect(await fs.exists('a.txt')).toBe(true)
    expect(await fs.exists('nope.txt')).toBe(false)
  })

  it('exists returns true for directories', async () => {
    await fs.mkdir('mydir')
    expect(await fs.exists('mydir')).toBe(true)
  })

  it('stat returns size', async () => {
    await fs.writeTextFile('sized.txt', 'abc')
    const s = await fs.stat('sized.txt')
    expect(s.size).toBe(3)
    expect(s.modifiedAt).toBeInstanceOf(Date)
  })

  it('stat throws for nonexistent file', async () => {
    await expect(fs.stat('ghost')).rejects.toThrow()
  })

  it('readFile throws for nonexistent file', async () => {
    await expect(fs.readFile('ghost')).rejects.toThrow()
  })

  it('readdir lists files and dirs', async () => {
    await fs.writeTextFile('notes/a.md', 'A')
    await fs.writeTextFile('notes/b.md', 'B')
    await fs.writeTextFile('notes/sub/c.md', 'C')

    const entries = await fs.readdir('notes')
    const names = entries.map((e) => e.name).sort()
    expect(names).toEqual(['a.md', 'b.md', 'sub'])
    expect(entries.find((e) => e.name === 'sub')!.isDirectory).toBe(true)
  })

  it('readdir of root lists top-level', async () => {
    await fs.writeTextFile('root.md', 'R')
    await fs.writeTextFile('folder/child.md', 'C')
    const entries = await fs.readdir('')
    const names = entries.map((e) => e.name).sort()
    expect(names).toEqual(['folder', 'root.md'])
  })

  it('rename moves a file', async () => {
    await fs.writeTextFile('old.md', 'data')
    await fs.rename('old.md', 'new.md')
    expect(await fs.exists('old.md')).toBe(false)
    expect(await fs.readTextFile('new.md')).toBe('data')
  })

  it('rename throws for nonexistent source', async () => {
    await expect(fs.rename('ghost', 'dest')).rejects.toThrow()
  })

  it('copy duplicates a file', async () => {
    await fs.writeTextFile('src.md', 'data')
    await fs.copy('src.md', 'dest.md')
    expect(await fs.readTextFile('src.md')).toBe('data')
    expect(await fs.readTextFile('dest.md')).toBe('data')
  })

  it('remove deletes a file', async () => {
    await fs.writeTextFile('bye.md', 'gone')
    await fs.remove('bye.md')
    expect(await fs.exists('bye.md')).toBe(false)
  })

  it('removeDir deletes all contents', async () => {
    await fs.writeTextFile('dir/a.md', 'A')
    await fs.writeTextFile('dir/b.md', 'B')
    await fs.removeDir('dir')
    expect(await fs.exists('dir/a.md')).toBe(false)
    expect(await fs.exists('dir/b.md')).toBe(false)
  })

  it('readdir guesses file types correctly', async () => {
    await fs.writeTextFile('notes/note.md', 'md')
    await fs.writeFile('files/doc.pdf', new Uint8Array([0]))
    await fs.writeTextFile('canvas/board.canvas', '{}')
    await fs.writeTextFile('misc/readme.txt', 'hi')

    const notes = await fs.readdir('notes')
    expect(notes[0]!.type).toBe(FileType.Markdown)

    const pdfs = await fs.readdir('files')
    expect(pdfs[0]!.type).toBe(FileType.Pdf)

    const canvases = await fs.readdir('canvas')
    expect(canvases[0]!.type).toBe(FileType.Canvas)

    const misc = await fs.readdir('misc')
    expect(misc[0]!.type).toBe(FileType.Other)
  })

  it('overwrite existing file', async () => {
    await fs.writeTextFile('f.md', 'v1')
    await fs.writeTextFile('f.md', 'v2')
    expect(await fs.readTextFile('f.md')).toBe('v2')
  })

  it('copy is independent (not aliased)', async () => {
    await fs.writeTextFile('original.md', 'data')
    await fs.copy('original.md', 'clone.md')
    await fs.writeTextFile('original.md', 'changed')
    expect(await fs.readTextFile('clone.md')).toBe('data')
  })
})
