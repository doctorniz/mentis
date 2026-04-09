import { describe, it, expect, beforeEach } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs'
import type { FileEntry, FileStats } from '@/types/files'
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  deleteSnapshot,
  pruneSnapshots,
  parseSnapshotTimestamp,
} from '@/lib/snapshot'

class InMemoryAdapter implements FileSystemAdapter {
  readonly type = 'opfs' as const
  files = new Map<string, Uint8Array>()
  dirs = new Set<string>()

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
    return this.files.has(path) || this.dirs.has(path)
  }
  async stat(path: string): Promise<FileStats> {
    const data = this.files.get(path)
    return { size: data?.length ?? 0, modifiedAt: Date.now(), isDirectory: this.dirs.has(path) }
  }
  async mkdir(path: string): Promise<void> {
    this.dirs.add(path)
  }
  async readdir(path: string): Promise<FileEntry[]> {
    const entries: FileEntry[] = []
    const prefix = path.endsWith('/') ? path : path + '/'
    const seen = new Set<string>()
    for (const [p, data] of this.files) {
      if (!p.startsWith(prefix)) continue
      const rest = p.slice(prefix.length)
      const name = rest.split('/')[0]!
      if (seen.has(name)) continue
      seen.add(name)
      const isDir = rest.includes('/')
      entries.push({
        name,
        path: prefix + name,
        isDirectory: isDir,
        size: isDir ? undefined : data.length,
      })
    }
    return entries
  }
  async rename(oldPath: string, newPath: string): Promise<void> {
    const data = this.files.get(oldPath)
    if (data) {
      this.files.set(newPath, data)
      this.files.delete(oldPath)
    }
  }
  async copy(src: string, dest: string): Promise<void> {
    const data = this.files.get(src)
    if (data) this.files.set(dest, new Uint8Array(data))
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path)
  }
  async removeDir(path: string): Promise<void> {
    this.dirs.delete(path)
    for (const key of this.files.keys()) {
      if (key.startsWith(path + '/')) this.files.delete(key)
    }
  }
}

describe('parseSnapshotTimestamp', () => {
  it('parses a valid encoded timestamp', () => {
    const d = parseSnapshotTimestamp('2026-03-31T22-50-00-000Z')
    expect(d).toBeInstanceOf(Date)
    expect(d!.getUTCFullYear()).toBe(2026)
    expect(d!.getUTCMonth()).toBe(2) // March
    expect(d!.getUTCDate()).toBe(31)
    expect(d!.getUTCHours()).toBe(22)
    expect(d!.getUTCMinutes()).toBe(50)
  })

  it('returns null for garbage', () => {
    expect(parseSnapshotTimestamp('nope')).toBeNull()
    expect(parseSnapshotTimestamp('')).toBeNull()
  })

  it('returns null for incomplete timestamp', () => {
    expect(parseSnapshotTimestamp('2026-03-31T22-50')).toBeNull()
  })
})

describe('createSnapshot', () => {
  let fs: InMemoryAdapter

  beforeEach(() => {
    fs = new InMemoryAdapter()
    fs.files.set('docs/report.pdf', new Uint8Array([37, 80, 68, 70, 45]))
  })

  it('copies the PDF to the snapshots directory', async () => {
    const snapPath = await createSnapshot(fs, 'docs/report.pdf')
    expect(snapPath).toMatch(/^_marrow\/snapshots\/report_/)
    expect(snapPath).toMatch(/\.pdf$/)
    const snapData = await fs.readFile(snapPath)
    expect(snapData).toEqual(new Uint8Array([37, 80, 68, 70, 45]))
  })
})

describe('listSnapshots', () => {
  let fs: InMemoryAdapter

  beforeEach(() => {
    fs = new InMemoryAdapter()
    fs.files.set(
      '_marrow/snapshots/report_2026-03-30T10-00-00-000Z.pdf',
      new Uint8Array([1, 2, 3]),
    )
    fs.files.set(
      '_marrow/snapshots/report_2026-03-31T10-00-00-000Z.pdf',
      new Uint8Array([4, 5, 6, 7]),
    )
    fs.files.set(
      '_marrow/snapshots/other_2026-03-29T08-00-00-000Z.pdf',
      new Uint8Array([8]),
    )
  })

  it('lists all snapshots sorted newest first', async () => {
    const all = await listSnapshots(fs)
    expect(all).toHaveLength(3)
    expect(all[0]!.timestamp).toContain('2026-03-31')
  })

  it('filters by original filename', async () => {
    const filtered = await listSnapshots(fs, 'report.pdf')
    expect(filtered).toHaveLength(2)
    for (const s of filtered) expect(s.originalFile).toBe('report.pdf')
  })

  it('returns empty array when no snapshots dir', async () => {
    const emptyFs = new InMemoryAdapter()
    const result = await listSnapshots(emptyFs, 'anything.pdf')
    expect(result).toEqual([])
  })
})

describe('restoreSnapshot', () => {
  let fs: InMemoryAdapter
  const origPath = 'docs/report.pdf'
  const snapPath = '_marrow/snapshots/report_2026-03-30T10-00-00-000Z.pdf'

  beforeEach(() => {
    fs = new InMemoryAdapter()
    fs.files.set(origPath, new Uint8Array([10, 20, 30]))
    fs.files.set(snapPath, new Uint8Array([1, 2, 3]))
  })

  it('replaces the original with the snapshot contents', async () => {
    await restoreSnapshot(fs, snapPath, origPath)
    const restored = await fs.readFile(origPath)
    expect(restored).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('creates a safety snapshot of the current version before restoring', async () => {
    const before = await listSnapshots(fs, 'report.pdf')
    await restoreSnapshot(fs, snapPath, origPath)
    const after = await listSnapshots(fs, 'report.pdf')
    expect(after.length).toBe(before.length + 1)
  })
})

describe('deleteSnapshot', () => {
  let fs: InMemoryAdapter
  const snapPath = '_marrow/snapshots/report_2026-03-30T10-00-00-000Z.pdf'

  beforeEach(() => {
    fs = new InMemoryAdapter()
    fs.files.set(snapPath, new Uint8Array([1, 2, 3]))
  })

  it('removes the snapshot file', async () => {
    await deleteSnapshot(fs, snapPath)
    expect(fs.files.has(snapPath)).toBe(false)
  })
})

describe('pruneSnapshots', () => {
  let fs: InMemoryAdapter

  beforeEach(() => {
    fs = new InMemoryAdapter()
    for (let i = 1; i <= 7; i++) {
      const ts = `2026-03-${String(i).padStart(2, '0')}T10-00-00-000Z`
      fs.files.set(
        `_marrow/snapshots/report_${ts}.pdf`,
        new Uint8Array([i]),
      )
    }
  })

  it('prunes snapshots beyond maxPerFile', async () => {
    await pruneSnapshots(fs, { enabled: true, maxPerFile: 3, retentionDays: 365 })
    const remaining = await listSnapshots(fs, 'report.pdf')
    expect(remaining.length).toBeLessThanOrEqual(3)
    expect(remaining[0]!.timestamp).toContain('2026-03-07')
  })
})
