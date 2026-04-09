import { describe, it, expect, beforeEach } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry, FileStats } from '@/types/files'
import { FileType } from '@/types/files'
import { saveAsset, isImagePath } from '@/lib/notes/assets'

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
    this.dirs.add(path)
  }
  async readdir(): Promise<FileEntry[]> {
    return []
  }
  async rename(): Promise<void> {}
  async copy(): Promise<void> {}
  async remove(): Promise<void> {}
  async removeDir(): Promise<void> {}

  getFiles() {
    return this.files
  }
}

describe('saveAsset', () => {
  let fs: InMemoryAdapter

  beforeEach(() => {
    fs = new InMemoryAdapter()
  })

  it('saves a file under _assets/ with unique name', async () => {
    const data = new Uint8Array([1, 2, 3])
    const path = await saveAsset(fs, 'photo.png', data)
    expect(path).toMatch(/^_assets\/photo-[a-z0-9]+\.png$/)
    expect(await fs.exists(path)).toBe(true)
    const read = await fs.readFile(path)
    expect([...read]).toEqual([1, 2, 3])
  })

  it('creates _assets/ directory', async () => {
    await saveAsset(fs, 'test.jpg', new Uint8Array([0]))
    expect(await fs.exists('_assets')).toBe(true)
  })

  it('preserves file extension', async () => {
    const path = await saveAsset(fs, 'diagram.svg', new Uint8Array([0]))
    expect(path).toMatch(/\.svg$/)
  })

  it('sanitizes file names', async () => {
    const path = await saveAsset(fs, 'my file (1).png', new Uint8Array([0]))
    expect(path).not.toContain(' ')
    expect(path).not.toContain('(')
    expect(path).toMatch(/^_assets\/my_file__1_-[a-z0-9]+\.png$/)
  })

  it('generates unique names for duplicate files', async () => {
    const p1 = await saveAsset(fs, 'a.png', new Uint8Array([1]))
    const p2 = await saveAsset(fs, 'a.png', new Uint8Array([2]))
    expect(p1).not.toBe(p2)
  })
})

describe('isImagePath', () => {
  it('returns true for image extensions', () => {
    expect(isImagePath('photo.png')).toBe(true)
    expect(isImagePath('photo.jpg')).toBe(true)
    expect(isImagePath('photo.jpeg')).toBe(true)
    expect(isImagePath('photo.gif')).toBe(true)
    expect(isImagePath('photo.webp')).toBe(true)
    expect(isImagePath('photo.svg')).toBe(true)
  })

  it('returns false for non-image extensions', () => {
    expect(isImagePath('doc.pdf')).toBe(false)
    expect(isImagePath('note.md')).toBe(false)
    expect(isImagePath('data.json')).toBe(false)
  })

  it('is case-insensitive for extensions', () => {
    expect(isImagePath('photo.PNG')).toBe(true)
    expect(isImagePath('photo.Jpg')).toBe(true)
  })
})
