import { describe, it, expect, vi } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import { trackPathChanges } from '@/lib/fs/track'
import { remapStarred } from '@/lib/vault/starred'

describe('remapStarred', () => {
  it('moves a renamed file’s star', () => {
    expect(remapStarred(['a.md', 'b.md'], 'a.md', 'c.md')).toEqual(['c.md', 'b.md'])
  })

  it('moves the stars under a renamed folder', () => {
    expect(remapStarred(['Work/x.md', 'Work', 'Workshop.md'], 'Work', 'Jobs')).toEqual([
      'Jobs/x.md',
      'Jobs',
      'Workshop.md',
    ])
  })

  it('drops the stars of a deleted file or folder', () => {
    expect(remapStarred(['Work/x.md', 'a.md'], 'Work', null)).toEqual(['a.md'])
  })

  it('returns the same list when nothing is affected', () => {
    const paths = ['a.md']
    expect(remapStarred(paths, 'b.md.tmp', 'b.md')).toBe(paths)
  })

  it('ignores leading slashes', () => {
    expect(remapStarred(['/a.md'], 'a.md', '/b.md')).toEqual(['b.md'])
  })
})

describe('trackPathChanges', () => {
  function fakeFs(fail = false): FileSystemAdapter {
    const op = vi.fn(async () => {
      if (fail) throw new Error('nope')
    })
    return {
      type: 'opfs',
      init: op,
      readFile: vi.fn(),
      readTextFile: vi.fn(),
      writeFile: op,
      writeTextFile: op,
      exists: vi.fn(),
      stat: vi.fn(),
      mkdir: op,
      readdir: vi.fn(),
      rename: op,
      copy: op,
      remove: op,
      removeDir: op,
    } as unknown as FileSystemAdapter
  }

  it('reports renames and deletes after they succeed', async () => {
    const onRename = vi.fn()
    const onRemove = vi.fn()
    const fs = trackPathChanges(fakeFs(), { onRename, onRemove })
    await fs.rename('a.md', 'b.md')
    await fs.remove('c.md')
    await fs.removeDir('Work')
    expect(onRename).toHaveBeenCalledWith('a.md', 'b.md')
    expect(onRemove.mock.calls).toEqual([['c.md'], ['Work']])
  })

  it('reports nothing when the operation fails', async () => {
    const onRename = vi.fn()
    const fs = trackPathChanges(fakeFs(true), { onRename })
    await expect(fs.rename('a.md', 'b.md')).rejects.toThrow()
    expect(onRename).not.toHaveBeenCalled()
  })
})
