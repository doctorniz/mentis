import { describe, it, expect } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry, FileStats } from '@/types/files'
import { FileType, getFileType } from '@/types/files'
import { reapSnapshots, listSnapshots, pruneSnapshots } from '@/lib/snapshot'
import type { SnapshotConfig } from '@/types/vault'

/** Minimal in-memory adapter (dirs derived from file paths). */
class MemFs implements FileSystemAdapter {
  readonly type = 'opfs' as const
  files = new Map<string, Uint8Array>()
  /** readdir paths that should throw, to simulate an unreadable vault. */
  failDirs = new Set<string>()

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
    if (this.files.has(path)) return true
    const prefix = path + '/'
    for (const k of this.files.keys()) if (k.startsWith(prefix)) return true
    return false
  }
  async stat(): Promise<FileStats> {
    return { size: 0, createdAt: new Date(), modifiedAt: new Date() }
  }
  async mkdir(): Promise<void> {}
  async readdir(path: string): Promise<FileEntry[]> {
    if (this.failDirs.has(path)) throw new Error(`readdir denied: ${path}`)
    const prefix = path ? path + '/' : ''
    const entries: FileEntry[] = []
    const seenDirs = new Set<string>()
    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) continue
      const rest = filePath.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) {
        entries.push({ name: rest, path: filePath, isDirectory: false, type: getFileType(rest) })
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
  async removeDir(path: string): Promise<void> {
    const prefix = path + '/'
    for (const k of [...this.files.keys()]) if (k.startsWith(prefix)) this.files.delete(k)
  }
}

const BYTES = new Uint8Array([37, 80, 68, 70])

/** Encode a Date the way createSnapshot does (`:` and `.` → `-`). */
function encodeTs(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-')
}

function snapPath(name: string, d: Date): string {
  return `_marrow/snapshots/${name}_${encodeTs(d)}.pdf`
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

const CONFIG: SnapshotConfig = { enabled: true, maxPerFile: 5, retentionDays: 30 }

describe('reapSnapshots — orphans', () => {
  it('removes snapshots whose owner PDF no longer exists', async () => {
    const fs = new MemFs()
    const deleted1 = snapPath('deleted', daysAgo(1))
    const deleted2 = snapPath('deleted', daysAgo(2))
    fs.files.set('docs/report.pdf', BYTES) // live owner
    fs.files.set(snapPath('report', daysAgo(1)), BYTES)
    fs.files.set(deleted1, BYTES) // owner gone
    fs.files.set(deleted2, BYTES)

    const report = await reapSnapshots(fs, CONFIG)

    expect(report.deletedOrphans.sort()).toEqual([deleted1, deleted2].sort())
    expect(fs.files.has('docs/report.pdf')).toBe(true)
    expect((await listSnapshots(fs, 'report.pdf')).length).toBe(1)
    expect((await listSnapshots(fs, 'deleted.pdf')).length).toBe(0)
  })

  it('keeps snapshots when the owner lives anywhere in the vault', async () => {
    const fs = new MemFs()
    // Owner sits in a different folder than the snapshot filename implies —
    // ownership is by basename, not path.
    fs.files.set('archive/2025/report.pdf', BYTES)
    fs.files.set(snapPath('report', daysAgo(1)), BYTES)

    const report = await reapSnapshots(fs, CONFIG)

    expect(report.deletedOrphans).toEqual([])
    expect((await listSnapshots(fs, 'report.pdf')).length).toBe(1)
  })

  it('does not treat a snapshot as its own owner', async () => {
    // Snapshots are `.pdf` files under _marrow; the scan must skip _marrow
    // or every orphan would look self-owned and never get reaped.
    const fs = new MemFs()
    fs.files.set(snapPath('gone', daysAgo(1)), BYTES)

    const report = await reapSnapshots(fs, CONFIG)

    expect(report.deletedOrphans).toEqual([snapPath('gone', daysAgo(1))])
    expect((await listSnapshots(fs)).length).toBe(0)
  })
})

describe('reapSnapshots — live-owner pruning', () => {
  it('prunes snapshots of a live owner beyond maxPerFile', async () => {
    const fs = new MemFs()
    fs.files.set('report.pdf', BYTES)
    for (let i = 1; i <= 7; i++) fs.files.set(snapPath('report', daysAgo(i)), BYTES)

    const report = await reapSnapshots(fs, { ...CONFIG, maxPerFile: 3, retentionDays: 365 })

    expect(report.deletedOrphans).toEqual([])
    expect(report.deletedPruned.length).toBe(4)
    expect((await listSnapshots(fs, 'report.pdf')).length).toBe(3)
  })

  it('prunes snapshots older than retentionDays (regression: dashed timestamp parse)', async () => {
    const fs = new MemFs()
    const recent = daysAgo(2)
    fs.files.set('report.pdf', BYTES)
    fs.files.set(snapPath('report', recent), BYTES) // recent → keep
    fs.files.set(snapPath('report', daysAgo(40)), BYTES) // expired → prune
    fs.files.set(snapPath('report', daysAgo(90)), BYTES) // expired → prune

    const report = await reapSnapshots(fs, { ...CONFIG, maxPerFile: 100, retentionDays: 30 })

    expect(report.deletedPruned.length).toBe(2)
    const remaining = await listSnapshots(fs, 'report.pdf')
    expect(remaining.length).toBe(1)
    expect(remaining[0]!.timestamp).toBe(encodeTs(recent))
  })
})

describe('reapSnapshots — safety', () => {
  it('deletes nothing when the vault scan fails', async () => {
    const fs = new MemFs()
    fs.files.set(snapPath('gone', daysAgo(1)), BYTES)
    fs.failDirs.add('') // root readdir throws → cannot enumerate owners

    await expect(reapSnapshots(fs, CONFIG)).rejects.toThrow()
    expect((await listSnapshots(fs)).length).toBe(1) // untouched
  })
})

describe('pruneSnapshots — retention regression', () => {
  it('expires by age once dashed timestamps are parsed', async () => {
    const fs = new MemFs()
    const recent = daysAgo(5)
    fs.files.set(snapPath('report', recent), BYTES)
    fs.files.set(snapPath('report', daysAgo(45)), BYTES)

    await pruneSnapshots(fs, { enabled: true, maxPerFile: 100, retentionDays: 30 })

    const remaining = await listSnapshots(fs, 'report.pdf')
    expect(remaining.length).toBe(1)
    expect(remaining[0]!.timestamp).toBe(encodeTs(recent))
  })
})
