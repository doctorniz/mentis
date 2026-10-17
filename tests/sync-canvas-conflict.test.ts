import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry } from '@/types/files'
import type { RemoteFileEntry, RemoteSyncProvider, SyncManifestEntry } from '@/lib/sync/types'
import { dropboxContentHash } from '@/lib/sync/providers/dropbox'
import { hashBytes } from '@/lib/sync/change-detector'
import { canvasRefs, drawingAssetOf, isDrawingPath } from '@/lib/sync/canvas-conflict'

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

/** Dropbox in memory. Every remote file reads as modified now. */
function fakeDropbox(remote: Map<string, Uint8Array>, changes?: string[]): RemoteSyncProvider {
  const entry = async (path: string): Promise<RemoteFileEntry> => ({
    path,
    hash: await dropboxContentHash(remote.get(path)!),
    modifiedAt: new Date().toISOString(),
    isDirectory: false,
    size: remote.get(path)!.length,
  })
  return {
    type: 'dropbox',
    listFiles: async () => ({
      entries: await Promise.all([...remote.keys()].map(entry)),
      cursor: 'cursor-1',
      hasMore: false,
    }),
    listChanges: async () => ({
      entries: await Promise.all((changes ?? []).map(entry)),
      deleted: [],
      cursor: 'cursor-2',
      hasMore: false,
    }),
    download: async (p: string) => {
      const f = remote.get(p)
      if (!f) throw new Error(`not found ${p}`)
      return f
    },
    upload: async (p: string, d: Uint8Array) => {
      remote.set(p, d)
      return entry(p)
    },
    mkdir: async () => {},
    remove: async (p: string) => void remote.delete(p),
    move: async (from: string, to: string) => {
      remote.set(to, remote.get(from)!)
      remote.delete(from)
    },
    listFolders: async () => [],
    contentHash: dropboxContentHash,
  } as unknown as RemoteSyncProvider
}

const ASSET = 'asset-1'
const png = (layer: string) => `_mentis/_drawings/${ASSET}/${layer}.png`

function canvasJson(viewportX: number, assetId: string | undefined = ASSET, version = 5): string {
  return JSON.stringify({
    version,
    width: 800,
    height: 600,
    viewport: { x: viewportX, y: 0, zoom: 1 },
    layers: [{ id: 'l1' }, { id: 'l2' }],
    activeLayerId: 'l1',
    ...(assetId ? { assetId } : {}),
  })
}

/** A drawing as last synced: the same files on both sides, in the manifest. */
async function syncedDrawing(lastSyncedAt = '2026-10-01T00:00:00.000Z') {
  const files: Record<string, string> = {
    'Art/Drawing.canvas': canvasJson(0),
    [png('l1')]: 'l1 synced',
    [png('l2')]: 'l2 synced',
  }
  for (const [path, text] of Object.entries(files)) {
    manifest.set(path, {
      path,
      localHash: await hashBytes(enc(text)),
      remoteHash: await dropboxContentHash(enc(text)),
      lastSyncedAt,
    })
  }
  const asMap = () => new Map(Object.entries(files).map(([p, t]) => [p, enc(t)]))
  return { local: asMap(), remote: asMap() }
}

/** The conflict copy of Art/Drawing.canvas in `files`, and its layer files. */
function copyOf(files: Map<string, Uint8Array>) {
  const path = [...files.keys()].find((p) => /^Art\/Drawing \(conflict .*\)\.canvas$/.test(p))
  if (!path) return null
  const refs = canvasRefs(files.get(path)!)!
  const layer = (id: string) => files.get(`_mentis/_drawings/${refs.assetId}/${id}.png`)
  return { path, refs, json: JSON.parse(dec(files.get(path)!)), layer }
}

const strayCopies = (files: Map<string, Uint8Array>) =>
  [...files.keys()].filter((p) => p.startsWith('_mentis/_drawings/') && p.includes('(conflict'))

beforeEach(() => {
  manifest.clear()
  cursor = null
})

describe('canvas conflict helpers', () => {
  it('knows which files belong to a drawing', () => {
    expect(isDrawingPath('Art/Drawing.canvas')).toBe(true)
    expect(isDrawingPath(png('l1'))).toBe(true)
    expect(drawingAssetOf(png('l1'))).toBe(ASSET)
    expect(drawingAssetOf('_mentis/_drawings/x.png')).toBe(null)
    expect(isDrawingPath('Art/notes.md')).toBe(false)
  })

  it('reads the asset and layer ids of a v5 canvas, and nothing from older ones', () => {
    expect(canvasRefs(enc(canvasJson(0)))).toEqual({ assetId: ASSET, layerIds: ['l1', 'l2'] })
    expect(canvasRefs(enc(canvasJson(0, undefined, 4)))).toBe(null)
    expect(canvasRefs(enc('not json'))).toBe(null)
  })
})

describe('conflicting drawings', () => {
  it('both sides drew: the local drawing is kept whole as a copy, with its own pixels', async () => {
    const { local, remote } = await syncedDrawing()
    local.set('Art/Drawing.canvas', enc(canvasJson(10)))
    local.set(png('l1'), enc('l1 local'))
    remote.set('Art/Drawing.canvas', enc(canvasJson(20)))
    remote.set(png('l1'), enc('l1 remote'))
    const mgr = new SyncManager(fakeDropbox(remote), memoryFs(local), 'v')
    const heard = vi.fn()
    mgr.onConflict(heard)

    await mgr.fullSync()

    // The drawing itself is the remote version on both sides.
    expect(dec(local.get(png('l1'))!)).toBe('l1 remote')
    expect(JSON.parse(dec(local.get('Art/Drawing.canvas')!)).viewport.x).toBe(20)
    // The copy is the local version, pointing at its own pixels.
    const copy = copyOf(local)!
    expect(copy.refs.assetId).not.toBe(ASSET)
    expect(copy.json.viewport.x).toBe(10)
    expect(dec(copy.layer('l1')!)).toBe('l1 local')
    expect(dec(copy.layer('l2')!)).toBe('l2 synced')
    // Uploaded too, and no stray per-layer copies anywhere.
    expect(copyOf(remote)!.path).toBe(copy.path)
    expect(dec(copyOf(remote)!.layer('l1')!)).toBe('l1 local')
    expect(strayCopies(local)).toEqual([])
    expect(strayCopies(remote)).toEqual([])
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard).toHaveBeenCalledWith({
      path: 'Art/Drawing.canvas',
      winner: 'remote',
      copyPath: copy.path,
    })
  })

  it('only a layer conflicts: the drawing is still copied whole', async () => {
    const { local, remote } = await syncedDrawing()
    local.set(png('l2'), enc('l2 local'))
    remote.set(png('l2'), enc('l2 remote'))
    const mgr = new SyncManager(fakeDropbox(remote), memoryFs(local), 'v')

    await mgr.fullSync()

    expect(dec(local.get(png('l2'))!)).toBe('l2 remote')
    const copy = copyOf(local)!
    expect(dec(copy.layer('l1')!)).toBe('l1 synced')
    expect(dec(copy.layer('l2')!)).toBe('l2 local')
    expect(strayCopies(local)).toEqual([])
  })

  it('when this side wins, the copy is the remote drawing', async () => {
    // Synced "after" the remote edit, so the local edit is the later one.
    const { local, remote } = await syncedDrawing('2099-01-01T00:00:00.000Z')
    local.set(png('l1'), enc('l1 local'))
    remote.set(png('l1'), enc('l1 remote'))
    const mgr = new SyncManager(fakeDropbox(remote), memoryFs(local), 'v')

    await mgr.fullSync()

    expect(dec(local.get(png('l1'))!)).toBe('l1 local')
    expect(dec(remote.get(png('l1'))!)).toBe('l1 local')
    expect(dec(copyOf(local)!.layer('l1')!)).toBe('l1 remote')
  })

  it('the 30-second pull copies a conflicting drawing whole too', async () => {
    const { local, remote } = await syncedDrawing()
    cursor = 'cursor-1'
    local.set(png('l1'), enc('l1 local'))
    remote.set(png('l1'), enc('l1 remote'))
    const mgr = new SyncManager(fakeDropbox(remote, [png('l1')]), memoryFs(local), 'v')

    await mgr.pull()

    expect(dec(local.get(png('l1'))!)).toBe('l1 remote')
    expect(dec(copyOf(local)!.layer('l1')!)).toBe('l1 local')
    expect(strayCopies(local)).toEqual([])
  })

  it('an older canvas without an asset id keeps the per-file copy', async () => {
    const { local, remote } = await syncedDrawing()
    const old = canvasJson(0, undefined, 4)
    for (const side of [local, remote]) side.set('Art/Drawing.canvas', enc(old))
    manifest.set('Art/Drawing.canvas', {
      path: 'Art/Drawing.canvas',
      localHash: await hashBytes(enc(old)),
      remoteHash: await dropboxContentHash(enc(old)),
      lastSyncedAt: '2026-10-01T00:00:00.000Z',
    })
    local.set('Art/Drawing.canvas', enc(canvasJson(10, undefined, 4)))
    remote.set('Art/Drawing.canvas', enc(canvasJson(20, undefined, 4)))
    const mgr = new SyncManager(fakeDropbox(remote), memoryFs(local), 'v')

    await mgr.fullSync()

    const copyPath = [...local.keys()].find((p) => p.includes('(conflict'))!
    expect(copyPath).toMatch(/^Art\/Drawing \(conflict .*\)\.canvas$/)
    expect(JSON.parse(dec(local.get(copyPath)!)).viewport.x).toBe(10)
  })
})
