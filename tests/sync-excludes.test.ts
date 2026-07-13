import { describe, it, expect } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry, FileStats } from '@/types/files'
import { FileType } from '@/types/files'
import type { SyncState } from '@/lib/sync/sync-state'
import type { SyncManifestEntry } from '@/lib/sync/types'
import { buildSyncExcludeMatcher, isSyncExcluded } from '@/lib/sync/excludes'
import { detectLocalChanges, hashBytes } from '@/lib/sync/change-detector'

describe('sync exclude matcher', () => {
  it('excludes the default local-only artifacts and their contents', () => {
    expect(isSyncExcluded('_marrow/snapshots')).toBe(true)
    expect(isSyncExcluded('_marrow/snapshots/report.pdf')).toBe(true)
    expect(isSyncExcluded('_marrow/snapshots/deep/nested.pdf')).toBe(true)
    expect(isSyncExcluded('_marrow/search-index.json')).toBe(true)
  })

  it('does not false-match sibling names or other vault content', () => {
    expect(isSyncExcluded('_marrow/snapshots-old/x.pdf')).toBe(false)
    expect(isSyncExcluded('_marrow/search-index.json.bak')).toBe(false)
    expect(isSyncExcluded('_marrow/config.json')).toBe(false)
    expect(isSyncExcluded('_marrow/_drawings/abc/l1.png')).toBe(false)
    expect(isSyncExcluded('notes/todo.md')).toBe(false)
  })

  it('normalizes leading and trailing slashes', () => {
    expect(isSyncExcluded('/_marrow/snapshots/x.pdf')).toBe(true)
    const matcher = buildSyncExcludeMatcher(['/Big Folder/'])
    expect(matcher('Big Folder/video.mp4')).toBe(true)
    expect(matcher('Big Folder')).toBe(true)
    expect(matcher('Big Folder 2/file.md')).toBe(false)
  })

  it('merges user patterns with the defaults', () => {
    const matcher = buildSyncExcludeMatcher(['drafts'])
    expect(matcher('drafts/wip.md')).toBe(true)
    expect(matcher('_marrow/snapshots/x.pdf')).toBe(true) // defaults kept
    expect(matcher('notes/final.md')).toBe(false)
  })
})

/* ---- detectLocalChanges with excludes ---- */

class MemFs implements FileSystemAdapter {
  readonly type = 'opfs' as const
  files = new Map<string, Uint8Array>()

  async init() {}
  async readFile(path: string): Promise<Uint8Array> {
    const d = this.files.get(path)
    if (!d) throw new Error(`Not found: ${path}`)
    return d
  }
  async readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(path))
  }
  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, data)
  }
  async writeTextFile(path: string, content: string): Promise<void> {
    this.files.set(path, new TextEncoder().encode(content))
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
    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) continue
      const rest = filePath.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) {
        entries.push({ name: rest, path: filePath, isDirectory: false, type: FileType.Other })
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

function manifestEntry(path: string, localHash: string): SyncManifestEntry {
  return { path, localHash, remoteHash: localHash, lastSyncedAt: new Date().toISOString() }
}

describe('detectLocalChanges with excludes', () => {
  it('never reports excluded files as created', async () => {
    const fs = new MemFs()
    await fs.writeTextFile('note.md', 'hello')
    await fs.writeTextFile('_marrow/snapshots/backup.pdf', 'BIG')
    await fs.writeTextFile('_marrow/search-index.json', '{}')

    const changes = await detectLocalChanges(fs, fakeState([]), isSyncExcluded)

    expect(changes.created).toEqual(['note.md'])
    expect(changes.modified).toEqual([])
    expect(changes.deleted).toEqual([])
  })

  it('does not surface stale excluded manifest rows as local deletes', async () => {
    const fs = new MemFs()
    await fs.writeTextFile('note.md', 'hello')
    const noteHash = await hashBytes(new TextEncoder().encode('hello'))

    // Manifest predates the exclude feature: it tracked a snapshot.
    const state = fakeState([
      manifestEntry('note.md', noteHash),
      manifestEntry('_marrow/snapshots/old.pdf', 'deadbeef'),
    ])

    const changes = await detectLocalChanges(fs, state, isSyncExcluded)

    // The snapshot row must NOT appear as deleted — that would remove
    // the remote copy. It is simply invisible.
    expect(changes.deleted).toEqual([])
    expect(changes.created).toEqual([])
    expect(changes.modified).toEqual([])
  })

  it('normal change detection is unaffected for non-excluded paths', async () => {
    const fs = new MemFs()
    await fs.writeTextFile('kept.md', 'same')
    await fs.writeTextFile('changed.md', 'v2')
    await fs.writeTextFile('new.md', 'brand new')
    const sameHash = await hashBytes(new TextEncoder().encode('same'))

    const state = fakeState([
      manifestEntry('kept.md', sameHash),
      manifestEntry('changed.md', 'old-hash'),
      manifestEntry('gone.md', 'whatever'),
    ])

    const changes = await detectLocalChanges(fs, state, isSyncExcluded)

    expect(changes.created).toEqual(['new.md'])
    expect(changes.modified).toEqual(['changed.md'])
    expect(changes.deleted).toEqual(['gone.md'])
  })
})
