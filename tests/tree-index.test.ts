import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'
import { IndexStore } from '@/core/index/store'
import type { TreeRow } from '@/core/index/protocol'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry } from '@/types/files'

const row = (path: string, isDirectory = false): TreeRow => ({
  name: path.split('/').pop()!,
  path,
  isDirectory,
  size: 1,
  mtime: 2,
})

describe('IndexStore tree', () => {
  let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>>
  let db: Database
  let store: IndexStore

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule()
  })
  beforeEach(() => {
    db = new sqlite3.oo1.DB(':memory:')
    store = new IndexStore(db)
  })

  it('knows nothing about a folder it has not listed', () => {
    expect(store.children('')).toBeNull()
    expect(store.children('a')).toBeNull()
  })

  it("returns a folder's entries, and tells an empty folder from an unknown one", () => {
    store.setChildren([
      { dir: '', entries: [row('a', true), row('x.md')] },
      { dir: 'a', entries: [] },
    ])
    expect(
      store
        .children('')
        ?.map((e) => e.path)
        .sort(),
    ).toEqual(['a', 'x.md'])
    expect(store.children('')?.find((e) => e.path === 'a')?.isDirectory).toBe(true)
    expect(store.children('a')).toEqual([])
    expect(store.children('b')).toBeNull()
  })

  it("replaces a folder's entries on a new listing", () => {
    store.setChildren([{ dir: '', entries: [row('x.md'), row('y.md')] }])
    store.setChildren([{ dir: '', entries: [row('y.md'), row('z.md')] }])
    expect(
      store
        .children('')
        ?.map((e) => e.path)
        .sort(),
    ).toEqual(['y.md', 'z.md'])
  })

  it('forgets a vanished folder with everything beneath it', () => {
    store.setChildren([
      { dir: '', entries: [row('a', true), row('ab', true)] },
      { dir: 'a', entries: [row('a/b', true), row('a/n.md')] },
      { dir: 'a/b', entries: [row('a/b/deep.md')] },
      { dir: 'ab', entries: [row('ab/keep.md')] },
    ])
    store.setChildren([{ dir: '', entries: [row('ab', true)] }])
    expect(store.children('a')).toBeNull()
    expect(store.children('a/b')).toBeNull()
    expect(store.children('ab')?.map((e) => e.path)).toEqual(['ab/keep.md'])
  })

  it('keeps the tree across reopening, and drops it with the index version', () => {
    store.setChildren([{ dir: '', entries: [row('x.md')] }])
    expect(new IndexStore(db).children('')?.map((e) => e.path)).toEqual(['x.md'])
    db.exec('PRAGMA user_version = 0')
    expect(new IndexStore(db).children('')).toBeNull()
  })
})

const index = vi.hoisted(() => ({
  open: true,
  cached: null as TreeRow[] | null,
  cacheDelay: 0,
  put: vi.fn(async () => {}),
}))

vi.mock('@/lib/search/index', () => ({
  getTreeChildren: vi.fn(async () => {
    if (!index.open) return null
    if (index.cacheDelay) await new Promise((r) => setTimeout(r, index.cacheDelay))
    return index.cached
  }),
  putTreeListings: index.put,
}))

const { listFolder } = await import('@/lib/notes/tree-listing')

function diskWith(entries: Array<[string, boolean]>, delay = 0): FileSystemAdapter {
  return {
    readdir: async () => {
      if (delay) await new Promise((r) => setTimeout(r, delay))
      return entries.map(
        ([path, isDirectory]): FileEntry => ({
          name: path.split('/').pop()!,
          path,
          isDirectory,
          type: 'other',
        }),
      )
    },
  } as unknown as FileSystemAdapter
}

describe('listFolder', () => {
  beforeEach(() => {
    index.open = true
    index.cached = null
    index.cacheDelay = 0
    index.put.mockClear()
  })

  const names = (calls: FileEntry[][]) => calls.map((c) => c.map((e) => e.name))

  it('shows the index first, then the disk only if it differs', async () => {
    index.cached = [row('old.md'), row('keep.md')]
    const reports: FileEntry[][] = []
    await listFolder(
      diskWith(
        [
          ['keep.md', false],
          ['new.md', false],
        ],
        20,
      ),
      '',
      (e) => reports.push(e),
    )
    expect(names(reports)).toEqual([
      ['keep.md', 'old.md'],
      ['keep.md', 'new.md'],
    ])
    expect(index.put).toHaveBeenCalledTimes(1)
  })

  it('reports once and writes nothing when the disk matches the index', async () => {
    index.cached = [row('a', true), row('b.md')]
    const reports: FileEntry[][] = []
    await listFolder(
      diskWith(
        [
          ['a', true],
          ['b.md', false],
        ],
        20,
      ),
      '',
      (e) => reports.push(e),
    )
    expect(reports).toHaveLength(1)
    expect(index.put).not.toHaveBeenCalled()
  })

  it('falls back to the disk, and records it, when the folder is unknown', async () => {
    const reports: FileEntry[][] = []
    await listFolder(diskWith([['a.md', false]]), '', (e) => reports.push(e))
    expect(names(reports)).toEqual([['a.md']])
    expect(index.put).toHaveBeenCalledTimes(1)
  })

  it('does not wait for a slow index, and ignores its late answer', async () => {
    index.cached = [row('stale.md')]
    index.cacheDelay = 50
    const reports: FileEntry[][] = []
    await listFolder(diskWith([['fresh.md', false]]), '', (e) => reports.push(e))
    await new Promise((r) => setTimeout(r, 80))
    expect(names(reports)).toEqual([['fresh.md']])
  })

  it('skips the index when the tree already shows the folder', async () => {
    index.cached = [row('stale.md')]
    const reports: FileEntry[][] = []
    await listFolder(
      diskWith([['fresh.md', false]]),
      '',
      (e) => reports.push(e),
      () => false,
      false,
    )
    expect(names(reports)).toEqual([['fresh.md']])
  })

  it('reports nothing once cancelled', async () => {
    const reports: FileEntry[][] = []
    await listFolder(
      diskWith([['a.md', false]]),
      '',
      (e) => reports.push(e),
      () => true,
    )
    expect(reports).toEqual([])
    expect(index.put).not.toHaveBeenCalled()
  })

  it('lists only entries the tree shows', async () => {
    const reports: FileEntry[][] = []
    await listFolder(
      diskWith([
        ['_mentis', true],
        ['_assets', true],
        ['n.md', false],
        ['x.unknownext', false],
      ]),
      '',
      (e) => reports.push(e),
    )
    expect(names(reports)).toEqual([['n.md']])
  })
})
