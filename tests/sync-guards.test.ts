import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry } from '@/types/files'
import type { RemoteFileEntry, RemoteSyncProvider, SyncManifestEntry } from '@/lib/sync/types'
import { decideLocalDelete, needsDeleteConfirmation } from '@/lib/sync/conflicts'
import { expiredTrashDays, trashDay, trashPath } from '@/lib/sync/trash'
import { dropboxContentHash } from '@/lib/sync/providers/dropbox'
import { hashBytes } from '@/lib/sync/change-detector'

// The manifest lives in IndexedDB; an in-memory one is enough here.
const manifest = new Map<string, SyncManifestEntry>()
let cursor: string | null = null
vi.mock('@/lib/sync/sync-state', () => ({
  SyncState: class {
    async getEntry(path: string) {
      return manifest.get(path) ?? null
    }
    async setEntry(e: SyncManifestEntry) {
      manifest.set(e.path, e)
    }
    async removeEntry(path: string) {
      manifest.delete(path)
    }
    async getAllEntries() {
      return [...manifest.values()]
    }
    async getCursor() {
      return cursor
    }
    async setCursor(c: string) {
      cursor = c
    }
    async setLastSyncTimestamp() {}
    async clear() {}
  },
}))
vi.mock('@/lib/search/index', () => ({
  validFileHashes: async () => null,
  putFileHashes: async () => {},
}))

const { SyncManager } = await import('@/lib/sync/sync-manager')

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)
const today = trashDay(new Date())

/** A flat path → bytes map, with folders implied by the paths. */
function memoryFs(files: Map<string, Uint8Array>): FileSystemAdapter {
  return {
    type: 'opfs',
    init: async () => {},
    readFile: async (p) => {
      const f = files.get(p)
      if (!f) throw new Error(`missing ${p}`)
      return f
    },
    readTextFile: async (p) => dec(files.get(p)!),
    writeFile: async (p, d) => void files.set(p, d),
    writeTextFile: async (p, t) => void files.set(p, enc(t)),
    exists: async (p) => files.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')),
    stat: async () => ({ size: 0, createdAt: new Date(), modifiedAt: new Date() }),
    mkdir: async () => {},
    readdir: async (dir) => {
      const prefix = dir ? dir + '/' : ''
      const seen = new Map<string, FileEntry>()
      for (const [path, data] of files) {
        if (!path.startsWith(prefix)) continue
        const name = path.slice(prefix.length).split('/')[0]
        const isDirectory = path.slice(prefix.length).includes('/')
        seen.set(name, {
          name,
          path: prefix + name,
          type: 'other',
          isDirectory,
          size: isDirectory ? undefined : data.length,
        })
      }
      return [...seen.values()]
    },
    rename: async () => {},
    copy: async () => {},
    remove: async (p) => void files.delete(p),
    removeDir: async (p) => {
      for (const k of [...files.keys()]) if (k.startsWith(p + '/')) files.delete(k)
    },
  }
}

/** Dropbox in memory: hashes are real Dropbox content hashes. */
function fakeDropbox(
  remote: Map<string, Uint8Array>,
  opts: { changes?: { entries: string[]; deleted: string[] }; trashDays?: string[] } = {},
) {
  const entry = async (path: string): Promise<RemoteFileEntry> => ({
    path,
    hash: await dropboxContentHash(remote.get(path)!),
    modifiedAt: new Date().toISOString(),
    isDirectory: false,
    size: remote.get(path)!.length,
  })
  const removed: string[] = []
  const provider = {
    type: 'dropbox',
    listFiles: async () => ({
      entries: await Promise.all([...remote.keys()].map(entry)),
      cursor: 'cursor-1',
      hasMore: false,
    }),
    listChanges: async () => ({
      entries: await Promise.all((opts.changes?.entries ?? []).map(entry)),
      deleted: opts.changes?.deleted ?? [],
      cursor: 'cursor-2',
      hasMore: false,
    }),
    download: async (p: string) => remote.get(p)!,
    upload: async (p: string, d: Uint8Array) => {
      remote.set(p, d)
      return entry(p)
    },
    mkdir: async () => {},
    remove: async (p: string) => {
      removed.push(p)
      remote.delete(p)
    },
    move: async (from: string, to: string) => {
      remote.set(to, remote.get(from)!)
      remote.delete(from)
    },
    listFolders: async () => opts.trashDays ?? [],
    contentHash: dropboxContentHash,
  }
  return { provider: provider as unknown as RemoteSyncProvider, removed }
}

/** Record `paths` as synced with these bytes on both sides. */
async function track(files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    manifest.set(path, {
      path,
      localHash: await hashBytes(enc(text)),
      remoteHash: await dropboxContentHash(enc(text)),
      lastSyncedAt: '2026-10-01T00:00:00.000Z',
    })
  }
}

function vault(n: number): Record<string, string> {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [`Notes/n${i}.md`, `note ${i}`]))
}

const asMap = (files: Record<string, string>) =>
  new Map(Object.entries(files).map(([p, t]) => [p, enc(t)]))

beforeEach(() => {
  manifest.clear()
  cursor = null
})

describe('needsDeleteConfirmation', () => {
  it('asks at 5 or more files and over 10% of tracked files', () => {
    expect(needsDeleteConfirmation(4, 6)).toBe(false)
    expect(needsDeleteConfirmation(5, 6)).toBe(true)
    expect(needsDeleteConfirmation(5, 49)).toBe(true)
    expect(needsDeleteConfirmation(5, 50)).toBe(false)
    expect(needsDeleteConfirmation(0, 0)).toBe(false)
  })
})

describe('decideLocalDelete', () => {
  const entry = { path: 'a.md', localHash: 'l', remoteHash: 'r', lastSyncedAt: '' }
  it('trashes the remote copy when it is unchanged', () => {
    expect(decideLocalDelete({ manifestEntry: entry, remoteHash: 'r' })).toBe('trash-remote')
  })
  it('pulls a remote edit back instead of deleting it', () => {
    expect(decideLocalDelete({ manifestEntry: entry, remoteHash: 'r2' })).toBe('pull')
  })
  it('forgets a file gone from both sides', () => {
    expect(decideLocalDelete({ manifestEntry: entry, remoteHash: null })).toBe('forget')
  })
})

describe('trash paths', () => {
  it('puts the file under a folder for the day', () => {
    expect(trashPath('Work/a.md', new Date(2026, 9, 16, 9))).toBe(
      '_mentis/trash/2026-10-16/Work/a.md',
    )
  })
  it('expires day folders more than a month old', () => {
    const now = new Date(2026, 9, 16)
    expect(expiredTrashDays(['2026-09-15', '2026-09-16', '2026-10-01', 'keep-me'], now)).toEqual([
      '2026-09-15',
    ])
  })
})

describe('dropboxContentHash', () => {
  it('is SHA-256 of the SHA-256 of each 4 MiB block', async () => {
    const sha = (b: Uint8Array) => createHash('sha256').update(b).digest()
    const small = enc('hello')
    expect(await dropboxContentHash(small)).toBe(sha(sha(small)).toString('hex'))
    const big = new Uint8Array(4 * 1024 * 1024 + 3).fill(7)
    const blocks = Buffer.concat([
      sha(big.slice(0, 4 * 1024 * 1024)),
      sha(big.slice(4 * 1024 * 1024)),
    ])
    expect(await dropboxContentHash(big)).toBe(sha(blocks).toString('hex'))
  })
})

describe('full sync guards', () => {
  it('an emptied remote folder asks first, and Keep uploads everything again', async () => {
    const files = vault(6)
    await track(files)
    const local = asMap(files)
    const remote = new Map<string, Uint8Array>()
    const mgr = new SyncManager(fakeDropbox(remote).provider, memoryFs(local), 'v')
    const ask = vi.fn(async () => false)
    mgr.onConfirmDeletes(ask)

    await mgr.fullSync()

    expect(ask).toHaveBeenCalledWith({ deletes: 6, tracked: 6 })
    expect([...local.keys()].sort()).toEqual(Object.keys(files).sort())
    expect([...remote.keys()].sort()).toEqual(Object.keys(files).sort())
  })

  it('with no one to ask, a mass delete keeps the files', async () => {
    const files = vault(6)
    await track(files)
    const local = asMap(files)
    const mgr = new SyncManager(fakeDropbox(new Map()).provider, memoryFs(local), 'v')

    await mgr.fullSync()

    expect(local.size).toBe(6)
  })

  it('a confirmed delete moves local files to the trash', async () => {
    const files = vault(6)
    await track(files)
    const local = asMap(files)
    const mgr = new SyncManager(fakeDropbox(new Map()).provider, memoryFs(local), 'v')
    mgr.onConfirmDeletes(async () => true)

    await mgr.fullSync()

    expect(local.has('Notes/n0.md')).toBe(false)
    expect(dec(local.get(`_mentis/trash/${today}/Notes/n0.md`)!)).toBe('note 0')
    expect(manifest.size).toBe(0)
  })

  it('a small remote delete goes to the local trash without asking', async () => {
    const files = vault(6)
    await track(files)
    const local = asMap(files)
    const remote = asMap(files)
    remote.delete('Notes/n3.md')
    const mgr = new SyncManager(fakeDropbox(remote).provider, memoryFs(local), 'v')
    const ask = vi.fn(async () => true)
    mgr.onConfirmDeletes(ask)

    await mgr.fullSync()

    expect(ask).not.toHaveBeenCalled()
    expect(local.has('Notes/n3.md')).toBe(false)
    expect(dec(local.get(`_mentis/trash/${today}/Notes/n3.md`)!)).toBe('note 3')
  })

  it('a local delete moves the remote copy to the remote trash', async () => {
    const files = vault(6)
    await track(files)
    const local = asMap(files)
    local.delete('Notes/n2.md')
    const remote = asMap(files)
    const { provider, removed } = fakeDropbox(remote)

    await new SyncManager(provider, memoryFs(local), 'v').fullSync()

    expect(remote.has('Notes/n2.md')).toBe(false)
    expect(dec(remote.get(`_mentis/trash/${today}/Notes/n2.md`)!)).toBe('note 2')
    expect(removed).toEqual([])
  })

  it('a local delete of a file edited remotely since brings the edit back', async () => {
    const files = vault(6)
    await track(files)
    const local = asMap(files)
    local.delete('Notes/n2.md')
    const remote = asMap(files)
    remote.set('Notes/n2.md', enc('edited elsewhere'))

    await new SyncManager(fakeDropbox(remote).provider, memoryFs(local), 'v').fullSync()

    expect(dec(local.get('Notes/n2.md')!)).toBe('edited elsewhere')
    expect(dec(remote.get('Notes/n2.md')!)).toBe('edited elsewhere')
  })

  it('reconnecting: a different untracked remote file is kept as a conflict copy', async () => {
    const local = new Map([['_mentis/config.json', enc('{"fresh":true}')]])
    const remote = new Map([['_mentis/config.json', enc('{"synced":true}')]])
    const mgr = new SyncManager(fakeDropbox(remote).provider, memoryFs(local), 'v')
    const heard = vi.fn()
    mgr.onConflict(heard)

    await mgr.fullSync()

    const copy = heard.mock.calls[0][0].copyPath as string
    expect(dec(local.get('_mentis/config.json')!)).toBe('{"fresh":true}')
    expect(dec(local.get(copy)!)).toBe('{"synced":true}')
    expect(dec(remote.get(copy)!)).toBe('{"synced":true}')
  })

  it('reconnecting: an identical untracked file is just recorded', async () => {
    const local = new Map([['a.md', enc('same')]])
    const remote = new Map([['a.md', enc('same')]])
    const { provider } = fakeDropbox(remote)
    const upload = vi.spyOn(provider, 'upload')
    const mgr = new SyncManager(provider, memoryFs(local), 'v')
    const heard = vi.fn()
    mgr.onConflict(heard)

    await mgr.fullSync()

    expect(heard).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(manifest.get('a.md')?.remoteHash).toBe(await dropboxContentHash(enc('same')))
  })

  it('empties remote trash days older than a month, once', async () => {
    const { provider, removed } = fakeDropbox(new Map(), { trashDays: ['2020-01-01', today] })
    const mgr = new SyncManager(provider, memoryFs(new Map()), 'v')

    await mgr.fullSync()
    await mgr.fullSync()

    expect(removed).toEqual(['_mentis/trash/2020-01-01'])
  })
})

describe('delta pull guards', () => {
  it('a mass remote delete asks first, and Keep uploads the files again', async () => {
    const files = vault(6)
    await track(files)
    cursor = 'cursor-1'
    const local = asMap(files)
    const remote = new Map<string, Uint8Array>()
    const deleted = Object.keys(files)
    const mgr = new SyncManager(
      fakeDropbox(remote, { changes: { entries: [], deleted } }).provider,
      memoryFs(local),
      'v',
    )
    const ask = vi.fn(async () => false)
    mgr.onConfirmDeletes(ask)

    await mgr.pull()

    expect(ask).toHaveBeenCalledWith({ deletes: 6, tracked: 6 })
    expect(local.size).toBe(6)
    expect(remote.size).toBe(6)
  })

  it('a confirmed remote delete moves the local file to the trash', async () => {
    const files = vault(6)
    await track(files)
    cursor = 'cursor-1'
    const local = asMap(files)
    const mgr = new SyncManager(
      fakeDropbox(new Map(), { changes: { entries: [], deleted: ['Notes/n1.md'] } }).provider,
      memoryFs(local),
      'v',
    )

    await mgr.pull()

    expect(local.has('Notes/n1.md')).toBe(false)
    expect(dec(local.get(`_mentis/trash/${today}/Notes/n1.md`)!)).toBe('note 1')
  })

  it('a poll during a sync waiting on the question is skipped', async () => {
    const files = vault(6)
    await track(files)
    const mgr = new SyncManager(fakeDropbox(new Map()).provider, memoryFs(asMap(files)), 'v')
    let answer: (v: boolean) => void = () => {}
    const ask = vi.fn(() => new Promise<boolean>((r) => (answer = r)))
    mgr.onConfirmDeletes(ask)

    const first = mgr.fullSync()
    await vi.waitFor(() => expect(ask).toHaveBeenCalled())
    await mgr.pull()
    expect(mgr.fullSync()).toBe(first)
    answer(false)
    await first

    expect(ask).toHaveBeenCalledTimes(1)
  })
})
