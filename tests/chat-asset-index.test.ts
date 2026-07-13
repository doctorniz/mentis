import { describe, it, expect } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry, FileStats } from '@/types/files'
import {
  CHAT_ASSET_INDEX_PATH,
  ensureChatAssetIdForPath,
  lookupChatAssetId,
  movePdfChatAssetId,
} from '@/lib/chat/asset-index'

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
  async stat(path: string): Promise<FileStats> {
    const d = this.files.get(path)
    if (!d) throw new Error(`Not found: ${path}`)
    return { size: d.length, createdAt: new Date(), modifiedAt: new Date() }
  }
  async mkdir(): Promise<void> {}
  async readdir(): Promise<FileEntry[]> {
    return []
  }
  async rename(oldPath: string, newPath: string): Promise<void> {
    const d = this.files.get(oldPath)
    if (!d) throw new Error(`Not found: ${oldPath}`)
    this.files.delete(oldPath)
    this.files.set(newPath, d)
  }
  async copy(): Promise<void> {}
  async remove(path: string): Promise<void> {
    this.files.delete(path)
  }
  async removeDir(): Promise<void> {}
}

const PDF_A = new TextEncoder().encode('%PDF-1.7 content A')
const PDF_B = new TextEncoder().encode('%PDF-1.7 content B — different bytes')

async function readIndexRaw(fs: MemFs): Promise<{
  schemaVersion: number
  entries: Record<string, { id: string; size?: number; hash?: string }>
}> {
  return JSON.parse(await fs.readTextFile(CHAT_ASSET_INDEX_PATH))
}

describe('chat asset index (schema v2 + AI5 reconciliation)', () => {
  it('mints an id with a content fingerprint', async () => {
    const fs = new MemFs()
    await fs.writeFile('doc.pdf', PDF_A)

    const id = await ensureChatAssetIdForPath(fs, 'doc.pdf')

    const idx = await readIndexRaw(fs)
    expect(idx.schemaVersion).toBe(2)
    expect(idx.entries['doc.pdf'].id).toBe(id)
    expect(idx.entries['doc.pdf'].size).toBe(PDF_A.length)
    expect(idx.entries['doc.pdf'].hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('migrates a v1 index (bare uuid strings) and backfills the fingerprint', async () => {
    const fs = new MemFs()
    await fs.writeFile('doc.pdf', PDF_A)
    await fs.writeTextFile(
      CHAT_ASSET_INDEX_PATH,
      JSON.stringify({ schemaVersion: 1, entries: { 'doc.pdf': 'legacy-uuid' } }),
    )

    const id = await ensureChatAssetIdForPath(fs, 'doc.pdf')
    expect(id).toBe('legacy-uuid') // id preserved across migration

    const idx = await readIndexRaw(fs)
    expect(idx.schemaVersion).toBe(2)
    expect(idx.entries['doc.pdf']).toMatchObject({ id: 'legacy-uuid', size: PDF_A.length })
    expect(idx.entries['doc.pdf'].hash).toBeDefined()
  })

  it('reconciles an out-of-band rename: same bytes, old path gone → adopts the old id', async () => {
    const fs = new MemFs()
    await fs.writeFile('report.pdf', PDF_A)
    const originalId = await ensureChatAssetIdForPath(fs, 'report.pdf') // fingerprinted

    // OS-level rename while the app was closed:
    await fs.rename('report.pdf', 'renamed-report.pdf')

    const adopted = await ensureChatAssetIdForPath(fs, 'renamed-report.pdf')
    expect(adopted).toBe(originalId)

    const idx = await readIndexRaw(fs)
    expect(idx.entries['report.pdf']).toBeUndefined() // old row moved
    expect(idx.entries['renamed-report.pdf'].id).toBe(originalId)
    expect(await lookupChatAssetId(fs, 'renamed-report.pdf')).toBe(originalId)
  })

  it('does NOT adopt when the original file still exists (a copy, not a rename)', async () => {
    const fs = new MemFs()
    await fs.writeFile('report.pdf', PDF_A)
    const originalId = await ensureChatAssetIdForPath(fs, 'report.pdf')

    await fs.writeFile('copy-of-report.pdf', PDF_A) // identical bytes, original intact

    const copyId = await ensureChatAssetIdForPath(fs, 'copy-of-report.pdf')
    expect(copyId).not.toBe(originalId)
    expect(await lookupChatAssetId(fs, 'report.pdf')).toBe(originalId) // untouched
  })

  it('does NOT adopt when two dangling entries share the fingerprint (ambiguous)', async () => {
    const fs = new MemFs()
    await fs.writeFile('a.pdf', PDF_A)
    await fs.writeFile('b.pdf', PDF_A) // duplicate content
    const idA = await ensureChatAssetIdForPath(fs, 'a.pdf')
    const idB = await ensureChatAssetIdForPath(fs, 'b.pdf')

    // Both renamed out-of-band — reconciliation can't tell which is which.
    await fs.rename('a.pdf', 'x.pdf')
    await fs.rename('b.pdf', 'y.pdf')

    const idX = await ensureChatAssetIdForPath(fs, 'x.pdf')
    expect(idX).not.toBe(idA)
    expect(idX).not.toBe(idB)
  })

  it('does NOT adopt when the file was edited after the rename (hash moved)', async () => {
    const fs = new MemFs()
    await fs.writeFile('report.pdf', PDF_A)
    const originalId = await ensureChatAssetIdForPath(fs, 'report.pdf')

    await fs.rename('report.pdf', 'renamed.pdf')
    await fs.writeFile('renamed.pdf', PDF_B) // edited post-rename

    const id = await ensureChatAssetIdForPath(fs, 'renamed.pdf')
    expect(id).not.toBe(originalId)
  })

  it('refreshes a stale fingerprint on a known path (destructive PDF saves)', async () => {
    const fs = new MemFs()
    await fs.writeFile('doc.pdf', PDF_A)
    const id = await ensureChatAssetIdForPath(fs, 'doc.pdf')
    const before = (await readIndexRaw(fs)).entries['doc.pdf'].hash

    await fs.writeFile('doc.pdf', PDF_B) // annotation save rewrote the bytes
    const same = await ensureChatAssetIdForPath(fs, 'doc.pdf')
    expect(same).toBe(id) // id is stable

    const after = (await readIndexRaw(fs)).entries['doc.pdf']
    expect(after.hash).not.toBe(before)
    expect(after.size).toBe(PDF_B.length)
  })

  it('movePdfChatAssetId preserves the fingerprint with the id', async () => {
    const fs = new MemFs()
    await fs.writeFile('doc.pdf', PDF_A)
    const id = await ensureChatAssetIdForPath(fs, 'doc.pdf')

    await fs.rename('doc.pdf', 'moved.pdf')
    await movePdfChatAssetId(fs, 'doc.pdf', 'moved.pdf')

    const idx = await readIndexRaw(fs)
    expect(idx.entries['doc.pdf']).toBeUndefined()
    expect(idx.entries['moved.pdf']).toMatchObject({ id, size: PDF_A.length })
    expect(idx.entries['moved.pdf'].hash).toBeDefined()
  })
})
