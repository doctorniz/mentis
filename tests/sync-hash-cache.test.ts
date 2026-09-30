import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry, FileStats } from '@/types/files'
import { FileType } from '@/types/files'
import type { SyncState } from '@/lib/sync/sync-state'
import type { SyncManifestEntry } from '@/lib/sync/types'
import { detectLocalChanges, hashBytes, type HashCache } from '@/lib/sync/change-detector'
import { IndexStore } from '@/core/index/store'

/** In-memory vault that reports size and mtime, and counts file reads. */
class StatFs implements FileSystemAdapter {
  readonly type = 'opfs' as const
  files = new Map<string, { data: Uint8Array; mtime: number }>()
  reads: string[] = []
  private clock = 1_000

  async init() {}
  async readFile(path: string): Promise<Uint8Array> {
    const f = this.files.get(path)
    if (!f) throw new Error(`Not found: ${path}`)
    this.reads.push(path)
    return f.data
  }
  async readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(path))
  }
  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, { data, mtime: (this.clock += 1_000) })
  }
  async writeTextFile(path: string, content: string): Promise<void> {
    await this.writeFile(path, new TextEncoder().encode(content))
  }
  /** Rewrite in place keeping size and mtime (what a hash cache cannot see). */
  sneakyRewrite(path: string, content: string) {
    const f = this.files.get(path)!
    this.files.set(path, { data: new TextEncoder().encode(content), mtime: f.mtime })
  }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path)
  }
  async stat(): Promise<FileStats> {
    return { size: 0, createdAt: new Date(), modifiedAt: new Date() }
  }
  async mkdir(): Promise<void> {}
  async readdir(path: string): Promise<FileEntry[]> {
    const prefix = path ? path + '/' : ''
    const entries: FileEntry[] = []
    const seenDirs = new Set<string>()
    for (const [filePath, f] of this.files) {
      if (!filePath.startsWith(prefix)) continue
      const rest = filePath.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) {
        entries.push({
          name: rest,
          path: filePath,
          isDirectory: false,
          type: FileType.Other,
          size: f.data.length,
          modifiedAt: new Date(f.mtime).toISOString(),
        })
      } else {
        const dirName = rest.slice(0, slash)
        if (!seenDirs.has(dirName)) {
          seenDirs.add(dirName)
          entries.push({
            name: dirName,
            path: prefix + dirName,
            isDirectory: true,
            type: FileType.Other,
          })
        }
      }
    }
    return entries
  }
  async rename(): Promise<void> {}
  async copy(): Promise<void> {}
  async remove(path: string): Promise<void> {
    this.files.delete(path)
  }
  async removeDir(): Promise<void> {}
}

function fakeState(entries: SyncManifestEntry[]): SyncState {
  return { getAllEntries: async () => entries } as unknown as SyncState
}

async function synced(path: string, content: string): Promise<SyncManifestEntry> {
  const hash = await hashBytes(new TextEncoder().encode(content))
  return { path, localHash: hash, remoteHash: hash, lastSyncedAt: new Date().toISOString() }
}

let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>>
let store: IndexStore
let cache: HashCache

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule()
})

beforeEach(() => {
  store = new IndexStore(new sqlite3.oo1.DB(':memory:'))
  cache = {
    valid: async (files) => store.validHashes(files),
    put: async (hashes) => store.putHashes(hashes),
  }
})

describe('detectLocalChanges with a hash cache', () => {
  it('reads every file once, then none while nothing changes', async () => {
    const fs = new StatFs()
    await fs.writeTextFile('a.md', 'alpha')
    await fs.writeTextFile('media/photo.png', 'PNGDATA')
    const state = fakeState([
      await synced('a.md', 'alpha'),
      await synced('media/photo.png', 'PNGDATA'),
    ])

    const first = await detectLocalChanges(fs, state, () => false, cache)
    expect(fs.reads.sort()).toEqual(['a.md', 'media/photo.png'])

    fs.reads = []
    const second = await detectLocalChanges(fs, state, () => false, cache)
    expect(fs.reads).toEqual([])
    expect(second).toEqual(first)
    expect(second).toEqual({ created: [], modified: [], deleted: [] })
  })

  it('re-reads only files whose size or mtime changed, and reports them', async () => {
    const fs = new StatFs()
    await fs.writeTextFile('kept.md', 'same')
    await fs.writeTextFile('edited.md', 'v1')
    const state = fakeState([await synced('kept.md', 'same'), await synced('edited.md', 'v1')])
    await detectLocalChanges(fs, state, () => false, cache)

    await fs.writeTextFile('edited.md', 'v2') // same size, new mtime
    await fs.writeTextFile('new.md', 'fresh')
    fs.reads = []
    const changes = await detectLocalChanges(fs, state, () => false, cache)

    expect(fs.reads.sort()).toEqual(['edited.md', 'new.md'])
    expect(changes).toEqual({ created: ['new.md'], modified: ['edited.md'], deleted: [] })
  })

  it('forgets cached hashes of deleted files', async () => {
    const fs = new StatFs()
    await fs.writeTextFile('gone.md', 'bye')
    await detectLocalChanges(fs, fakeState([]), () => false, cache)
    const listing = [{ path: 'gone.md', size: 3, mtime: fs.files.get('gone.md')!.mtime }]

    await fs.remove('gone.md')
    const changes = await detectLocalChanges(
      fs,
      fakeState([await synced('gone.md', 'bye')]),
      () => false,
      cache,
    )

    expect(changes.deleted).toEqual(['gone.md'])
    // Even if the same path reappears with the same size and mtime, the old
    // hash is not reused: it was dropped when the file disappeared.
    expect(store.validHashes(listing)).toEqual({})
  })

  it('trusts size and mtime (agreed trade-off): an in-place rewrite that keeps both is not seen', async () => {
    const fs = new StatFs()
    await fs.writeTextFile('note.md', 'aaaa')
    const state = fakeState([await synced('note.md', 'aaaa')])
    await detectLocalChanges(fs, state, () => false, cache)

    fs.sneakyRewrite('note.md', 'bbbb')
    expect(await detectLocalChanges(fs, state, () => false, cache)).toEqual({
      created: [],
      modified: [],
      deleted: [],
    })
    // Without the cache it is caught, as before.
    expect((await detectLocalChanges(fs, state)).modified).toEqual(['note.md'])
  })

  it('hashes everything when the cache is unavailable', async () => {
    const fs = new StatFs()
    await fs.writeTextFile('a.md', 'alpha')
    await fs.writeTextFile('b.md', 'beta')
    const unavailable: HashCache = { valid: async () => null, put: async () => {} }

    await detectLocalChanges(fs, fakeState([]), () => false, unavailable)
    fs.reads = []
    await detectLocalChanges(fs, fakeState([]), () => false, unavailable)
    expect(fs.reads.sort()).toEqual(['a.md', 'b.md'])
  })

  it('does not cache or read excluded files', async () => {
    const fs = new StatFs()
    await fs.writeTextFile('note.md', 'x')
    await fs.writeTextFile('_mentis/snapshots/big.pdf', 'BIG')
    const excluded = (p: string) => p.startsWith('_mentis/snapshots')
    await detectLocalChanges(fs, fakeState([]), excluded, cache)
    expect(fs.reads).toEqual(['note.md'])
  })
})
