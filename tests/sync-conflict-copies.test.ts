import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { RemoteFileEntry, RemoteSyncProvider, SyncManifestEntry } from '@/lib/sync/types'
import { conflictCopyPath } from '@/lib/sync/conflicts'
import { hashBytes } from '@/lib/sync/change-detector'

// The manifest lives in IndexedDB; an in-memory one is enough here.
const manifest = new Map<string, SyncManifestEntry>()
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
      return 'cursor-1'
    }
    async setCursor() {}
    async setLastSyncTimestamp() {}
    async clear() {}
  },
}))

const { SyncManager } = await import('@/lib/sync/sync-manager')

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)

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
    exists: async (p) => files.has(p),
    stat: async () => ({ size: 0, createdAt: new Date(), modifiedAt: new Date() }),
    mkdir: async () => {},
    readdir: async () => [],
    rename: async () => {},
    copy: async () => {},
    remove: async (p) => void files.delete(p),
    removeDir: async () => {},
  }
}

function remoteEntry(path: string, hash: string, modifiedAt: string): RemoteFileEntry {
  return { path, hash, modifiedAt, size: 0, isDirectory: false } as RemoteFileEntry
}

function fakeDropbox(remote: Map<string, Uint8Array>, change: RemoteFileEntry): RemoteSyncProvider {
  return {
    type: 'dropbox',
    listChanges: async () => ({
      entries: [change],
      deleted: [],
      cursor: 'cursor-2',
      hasMore: false,
    }),
    download: async (p: string) => remote.get(p)!,
    upload: async (p: string, d: Uint8Array) => {
      remote.set(p, d)
      return remoteEntry(p, `h-${p}`, new Date().toISOString())
    },
    mkdir: async () => {},
    remove: async () => {},
  } as unknown as RemoteSyncProvider
}

describe('conflictCopyPath', () => {
  const when = new Date(2026, 9, 13, 14, 32)

  it('labels the name before the extension, in local time', () => {
    expect(conflictCopyPath('Work/Meeting.md', when)).toBe(
      'Work/Meeting (conflict 2026-10-13 14.32).md',
    )
  })

  it('keeps a compound suffix whole', () => {
    expect(conflictCopyPath('Board.kan.md', when, '.kan.md')).toBe(
      'Board (conflict 2026-10-13 14.32).kan.md',
    )
  })

  it('handles a name with no extension', () => {
    expect(conflictCopyPath('README', when)).toBe('README (conflict 2026-10-13 14.32)')
  })
})

describe('sync keeps the losing side of a conflict', () => {
  const synced = '2026-10-01T00:00:00.000Z'

  beforeEach(async () => {
    manifest.clear()
    manifest.set('note.md', {
      path: 'note.md',
      localHash: await hashBytes(enc('base')),
      remoteHash: 'r-base',
      lastSyncedAt: synced,
    })
  })

  it('remote newer: this device’s edit is saved as a copy, then the remote version is pulled', async () => {
    const local = new Map([['note.md', enc('local edit')]])
    const remote = new Map([['note.md', enc('remote edit')]])
    const change = remoteEntry('note.md', 'r-new', '2026-10-02T00:00:00.000Z')
    const mgr = new SyncManager(fakeDropbox(remote, change), memoryFs(local), 'v')
    const heard = vi.fn()
    mgr.onConflict(heard)

    await mgr.pull()

    const copy = heard.mock.calls[0][0].copyPath as string
    expect(copy).toMatch(/^note \(conflict \d{4}-\d\d-\d\d \d\d\.\d\d\)\.md$/)
    expect(dec(local.get('note.md')!)).toBe('remote edit')
    expect(dec(local.get(copy)!)).toBe('local edit')
    expect(dec(remote.get(copy)!)).toBe('local edit')
  })

  it('local newer: the remote version is saved as a copy, and the local edit is pushed', async () => {
    const local = new Map([['note.md', enc('local edit')]])
    const remote = new Map([['note.md', enc('remote edit')]])
    const change = remoteEntry('note.md', 'r-new', '2026-09-01T00:00:00.000Z')
    const mgr = new SyncManager(fakeDropbox(remote, change), memoryFs(local), 'v')
    const heard = vi.fn()
    mgr.onConflict(heard)

    await mgr.pull()

    const copy = heard.mock.calls[0][0].copyPath as string
    expect(dec(local.get('note.md')!)).toBe('local edit')
    expect(dec(remote.get('note.md')!)).toBe('local edit')
    expect(dec(local.get(copy)!)).toBe('remote edit')
  })

  it('overwrites nothing when the copy cannot be saved', async () => {
    const local = new Map([['note.md', enc('local edit')]])
    const remote = new Map([['note.md', enc('remote edit')]])
    const change = remoteEntry('note.md', 'r-new', '2026-10-02T00:00:00.000Z')
    const fs = memoryFs(local)
    fs.writeFile = async () => {
      throw new Error('disk full')
    }
    const mgr = new SyncManager(fakeDropbox(remote, change), fs, 'v')

    await expect(mgr.pull()).rejects.toThrow('disk full')
    expect(dec(local.get('note.md')!)).toBe('local edit')
  })
})
