import { describe, it, expect } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry, FileStats } from '@/types/files'
import { FileType, getFileType } from '@/types/files'
import { reapCanvasOrphans } from '@/lib/canvas/orphan-reaper'

/** Minimal in-memory adapter (dirs derived from file paths). */
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

const PNG = new Uint8Array([137, 80, 78, 71])

function canvasJson(assetId: string | null, layerIds: string[]): string {
  return JSON.stringify({
    version: 5,
    ...(assetId ? { assetId } : {}),
    layers: layerIds.map((id) => ({ id, name: id })),
  })
}

async function seed(fs: MemFs, entries: Record<string, string | Uint8Array>) {
  for (const [path, content] of Object.entries(entries)) {
    if (typeof content === 'string') await fs.writeTextFile(path, content)
    else await fs.writeFile(path, content)
  }
}

describe('reapCanvasOrphans', () => {
  it('removes unreferenced drawings folders and keeps referenced ones', async () => {
    const fs = new MemFs()
    await seed(fs, {
      'sketch.canvas': canvasJson('live-id', ['l1']),
      '_marrow/_drawings/live-id/l1.png': PNG,
      '_marrow/_drawings/dead-id/x.png': PNG,
    })

    const report = await reapCanvasOrphans(fs)

    expect(report.scannedCanvases).toBe(1)
    expect(report.deletedDrawingFolders).toEqual(['_marrow/_drawings/dead-id'])
    expect(fs.files.has('_marrow/_drawings/live-id/l1.png')).toBe(true)
    expect(fs.files.has('_marrow/_drawings/dead-id/x.png')).toBe(false)
  })

  it('removes stale layer PNGs but keeps live layers and non-png files', async () => {
    const fs = new MemFs()
    await seed(fs, {
      'sketch.canvas': canvasJson('id-1', ['keep-a', 'keep-b']),
      '_marrow/_drawings/id-1/keep-a.png': PNG,
      '_marrow/_drawings/id-1/keep-b.png': PNG,
      '_marrow/_drawings/id-1/deleted-layer.png': PNG,
      '_marrow/_drawings/id-1/notes.txt': PNG, // unknown file: untouched
    })

    const report = await reapCanvasOrphans(fs)

    expect(report.deletedLayerPngs).toEqual(['_marrow/_drawings/id-1/deleted-layer.png'])
    expect(fs.files.has('_marrow/_drawings/id-1/keep-a.png')).toBe(true)
    expect(fs.files.has('_marrow/_drawings/id-1/keep-b.png')).toBe(true)
    expect(fs.files.has('_marrow/_drawings/id-1/notes.txt')).toBe(true)
  })

  it('keeps a v4 .canvas.assets folder while its owner is still v4', async () => {
    const fs = new MemFs()
    await seed(fs, {
      'old.canvas': canvasJson(null, ['l1']), // v4: no assetId
      'old.canvas.assets/l1.png': PNG,
    })

    const report = await reapCanvasOrphans(fs)

    expect(report.deletedV4AssetFolders).toEqual([])
    expect(fs.files.has('old.canvas.assets/l1.png')).toBe(true)
  })

  it('removes a .canvas.assets folder once its owner migrated to v5', async () => {
    const fs = new MemFs()
    await seed(fs, {
      'old.canvas': canvasJson('migrated-id', ['l1']),
      'old.canvas.assets/l1.png': PNG,
      '_marrow/_drawings/migrated-id/l1.png': PNG,
    })

    const report = await reapCanvasOrphans(fs)

    expect(report.deletedV4AssetFolders).toEqual(['old.canvas.assets'])
    expect(fs.files.has('old.canvas.assets/l1.png')).toBe(false)
    expect(fs.files.has('_marrow/_drawings/migrated-id/l1.png')).toBe(true)
  })

  it('removes a .canvas.assets folder whose owner .canvas is gone', async () => {
    const fs = new MemFs()
    await seed(fs, {
      'other.canvas': canvasJson('a', []),
      'deleted.canvas.assets/l1.png': PNG,
    })

    const report = await reapCanvasOrphans(fs)

    expect(report.deletedV4AssetFolders).toEqual(['deleted.canvas.assets'])
    expect(fs.files.has('deleted.canvas.assets/l1.png')).toBe(false)
  })

  it('nested folders: canvases anywhere in the vault protect their folders', async () => {
    const fs = new MemFs()
    await seed(fs, {
      'projects/art/deep.canvas': canvasJson('deep-id', ['l1']),
      '_marrow/_drawings/deep-id/l1.png': PNG,
    })

    const report = await reapCanvasOrphans(fs)

    expect(report.scannedCanvases).toBe(1)
    expect(report.deletedDrawingFolders).toEqual([])
    expect(fs.files.has('_marrow/_drawings/deep-id/l1.png')).toBe(true)
  })

  it('duplicated .canvas files sharing an assetId union their layer sets', async () => {
    const fs = new MemFs()
    await seed(fs, {
      'a.canvas': canvasJson('shared', ['l1']),
      'a copy.canvas': canvasJson('shared', ['l2']),
      '_marrow/_drawings/shared/l1.png': PNG,
      '_marrow/_drawings/shared/l2.png': PNG,
      '_marrow/_drawings/shared/l3.png': PNG,
    })

    const report = await reapCanvasOrphans(fs)

    // l1 and l2 are each referenced by one of the duplicates — only l3 goes.
    expect(report.deletedLayerPngs).toEqual(['_marrow/_drawings/shared/l3.png'])
    expect(fs.files.has('_marrow/_drawings/shared/l1.png')).toBe(true)
    expect(fs.files.has('_marrow/_drawings/shared/l2.png')).toBe(true)
  })

  it('aborts without deleting anything when a .canvas fails to parse', async () => {
    const fs = new MemFs()
    await seed(fs, {
      'good.canvas': canvasJson('good-id', ['l1']),
      'corrupt.canvas': '{ not json',
      '_marrow/_drawings/good-id/l1.png': PNG,
      '_marrow/_drawings/orphan-id/x.png': PNG,
    })

    await expect(reapCanvasOrphans(fs)).rejects.toThrow()
    // The would-be orphan survives — the scan failed before any deletion.
    expect(fs.files.has('_marrow/_drawings/orphan-id/x.png')).toBe(true)
  })

  it('reports empty on a vault with no canvases and no drawings dir', async () => {
    const fs = new MemFs()
    await seed(fs, { 'note.md': '# hi' })

    const report = await reapCanvasOrphans(fs)

    expect(report).toEqual({
      scannedCanvases: 0,
      deletedDrawingFolders: [],
      deletedLayerPngs: [],
      deletedV4AssetFolders: [],
    })
  })
})
