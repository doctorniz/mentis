import { describe, it, expect } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry } from '@/types/files'
import { thoughtFilename, thoughtsDir } from '@/lib/board'
import { moveThoughtsFolder } from '@/lib/board/move-folder'

/** Files and folders by vault path; just what moving a folder touches. */
function memVault(paths: string[], dirs: string[] = []) {
  const files = new Set(paths)
  const folders = new Set(dirs)
  for (const p of paths) folders.add(p.split('/').slice(0, -1).join('/'))
  const children = (dir: string): FileEntry[] =>
    [...files, ...folders]
      .filter((p) => p !== dir && p.split('/').slice(0, -1).join('/') === dir)
      .map(
        (p) => ({ path: p, name: p.split('/').pop()!, isDirectory: folders.has(p) }) as FileEntry,
      )
  const fs = {
    exists: async (p: string) => files.has(p) || folders.has(p),
    readdir: async (p: string) => children(p),
    mkdir: async (p: string) => void folders.add(p),
    rename: async (a: string, b: string) => {
      files.delete(a)
      files.add(b)
    },
    removeDir: async (p: string) => void folders.delete(p),
  } as unknown as FileSystemAdapter
  return { fs, files, folders }
}

describe('thoughtFilename', () => {
  const at = new Date(2026, 9, 24, 14, 32)

  it('names a thought by its time and first words', () => {
    expect(thoughtFilename('Call the bank about the mortgage rate today please', at)).toBe(
      '2026-10-24 1432 Call the bank about the mortgage.md',
    )
  })

  it('drops markup and characters a file name cannot hold', () => {
    expect(thoughtFilename('\n# Plan: a/b *now*\n\n![x](Attachments/a.png)', at)).toBe(
      '2026-10-24 1432 Plan a b now.md',
    )
  })

  it('names an empty thought by its time alone', () => {
    expect(thoughtFilename('\n', at)).toBe('2026-10-24 1432.md')
  })
})

describe('thoughtsDir', () => {
  it('defaults to Thoughts and trims slashes', () => {
    expect(thoughtsDir(null)).toBe('Thoughts')
    expect(thoughtsDir({ thoughtsFolder: '/Inbox/Ideas/' })).toBe('Inbox/Ideas')
  })
})

describe('moveThoughtsFolder', () => {
  it('moves the thoughts and removes the emptied folder', async () => {
    const { fs, files, folders } = memVault(['Thoughts/a.md', 'Thoughts/b.md'])
    await moveThoughtsFolder(fs, 'Thoughts', 'Ideas')
    expect([...files].sort()).toEqual(['Ideas/a.md', 'Ideas/b.md'])
    expect(folders.has('Thoughts')).toBe(false)
  })

  it('leaves what is not a thought where it is', async () => {
    const { fs, files, folders } = memVault(['Thoughts/a.md', 'Thoughts/sketch.png'])
    await moveThoughtsFolder(fs, 'Thoughts', 'Ideas')
    expect([...files].sort()).toEqual(['Ideas/a.md', 'Thoughts/sketch.png'])
    expect(folders.has('Thoughts')).toBe(true)
  })

  it('refuses a folder that already holds anything', async () => {
    const { fs, files } = memVault(['Thoughts/a.md', 'Projects/plan.md'])
    await expect(moveThoughtsFolder(fs, 'Thoughts', 'Projects')).rejects.toThrow('not empty')
    expect(files.has('Thoughts/a.md')).toBe(true)
  })

  it('refuses the vault root and a folder inside the current one', async () => {
    const { fs } = memVault(['Thoughts/a.md'])
    await expect(moveThoughtsFolder(fs, 'Thoughts', '/')).rejects.toThrow()
    await expect(moveThoughtsFolder(fs, 'Thoughts', 'Thoughts/old')).rejects.toThrow('inside')
  })
})
