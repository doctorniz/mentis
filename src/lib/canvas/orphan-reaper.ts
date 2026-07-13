import type { FileSystemAdapter } from '@/lib/fs'

/**
 * Vault cleanup for canvas pixel data.
 *
 * Three kinds of dead weight accumulate (see CLAUDE.md "Canvas"):
 *
 *   1. Orphan drawings folders — `_marrow/_drawings/<assetId>/` whose
 *      assetId no `.canvas` file references (the canvas was deleted;
 *      its folder is deliberately not removed at delete time).
 *   2. Stale layer PNGs — `<layerId>.png` inside a LIVE drawings folder
 *      for layers that were deleted from the canvas.
 *   3. v4-migration leftovers — `<name>.canvas.assets/` sibling folders
 *      that the v4 → v5 migration left behind.
 *
 * SAFETY MODEL — this deletes user files, so it is conservative:
 *
 *   - Every `.canvas` file in the vault must read AND parse. Any failure
 *     aborts the whole reap (a folder must never look orphaned because
 *     we failed to read its owner).
 *   - A `<name>.canvas.assets/` folder is only removed when its sibling
 *     `.canvas` is v5 (has an `assetId` — migration completed) or does
 *     not exist at all. A still-v4 canvas keeps its folder: that IS its
 *     pixel data.
 *   - Inside live drawings folders only `*.png` files whose stem is not
 *     a current layer id are removed; anything else is left alone.
 *   - Callers must ensure no canvas editor is open or mid-flush (save
 *     order is PNGs-first JSON-last — reaping mid-save could see a new
 *     layer's PNG as stale). The Settings UI refuses while a canvas tab
 *     is open and awaits pending unmount flushes first.
 */

export interface CanvasOrphanReport {
  /** `.canvas` files found and successfully parsed. */
  scannedCanvases: number
  /** Removed `_marrow/_drawings/<assetId>` folders (unreferenced). */
  deletedDrawingFolders: string[]
  /** Removed stale `<layerId>.png` files inside live drawings folders. */
  deletedLayerPngs: string[]
  /** Removed v4 `<name>.canvas.assets` leftover folders. */
  deletedV4AssetFolders: string[]
}

const DRAWINGS_DIR = '_marrow/_drawings'
const V4_ASSETS_SUFFIX = '.canvas.assets'

interface VaultScan {
  /** vault path → parsed info for every .canvas file */
  canvases: Map<string, { assetId: string | null; layerIds: Set<string> }>
  /** paths of `<name>.canvas.assets` directories found outside _marrow */
  v4AssetDirs: string[]
}

/**
 * Parse the fields the reaper cares about from a `.canvas` JSON.
 * Throws on malformed JSON — the caller treats that as fatal.
 */
function parseCanvasRefs(raw: string): { assetId: string | null; layerIds: Set<string> } {
  const json = JSON.parse(raw) as { assetId?: unknown; layers?: unknown }
  const assetId = typeof json.assetId === 'string' && json.assetId.length > 0 ? json.assetId : null
  const layerIds = new Set<string>()
  if (Array.isArray(json.layers)) {
    for (const layer of json.layers) {
      const id = (layer as { id?: unknown } | null)?.id
      if (typeof id === 'string' && id) layerIds.add(id)
    }
  }
  return { assetId, layerIds }
}

async function scanVault(fs: FileSystemAdapter, dir: string, acc: VaultScan): Promise<void> {
  const entries = await fs.readdir(dir)
  for (const e of entries) {
    // _marrow is app metadata — no user .canvas files live there, and
    // _marrow/_drawings is handled separately by the reap itself.
    if (e.name.startsWith('_marrow')) continue

    if (e.isDirectory) {
      if (e.name.endsWith(V4_ASSETS_SUFFIX)) {
        acc.v4AssetDirs.push(e.path)
        continue // never descend into pixel folders
      }
      await scanVault(fs, e.path, acc)
    } else if (e.name.endsWith('.canvas')) {
      const raw = await fs.readTextFile(e.path)
      acc.canvases.set(e.path, parseCanvasRefs(raw))
    }
  }
}

/**
 * Scan the vault and delete orphaned canvas pixel data. Throws (deleting
 * nothing beyond what was already removed) if any `.canvas` file fails
 * to read or parse — in practice the scan happens fully before the first
 * deletion, so a scan failure deletes nothing at all.
 */
export async function reapCanvasOrphans(fs: FileSystemAdapter): Promise<CanvasOrphanReport> {
  const scan: VaultScan = { canvases: new Map(), v4AssetDirs: [] }
  await scanVault(fs, '', scan)

  // assetId → union of layer ids across every .canvas referencing it
  // (a duplicated .canvas file shares its source's assetId).
  const referenced = new Map<string, Set<string>>()
  for (const { assetId, layerIds } of scan.canvases.values()) {
    if (!assetId) continue
    const existing = referenced.get(assetId)
    if (existing) {
      for (const id of layerIds) existing.add(id)
    } else {
      referenced.set(assetId, new Set(layerIds))
    }
  }

  const report: CanvasOrphanReport = {
    scannedCanvases: scan.canvases.size,
    deletedDrawingFolders: [],
    deletedLayerPngs: [],
    deletedV4AssetFolders: [],
  }

  // ---- 1 + 2: _marrow/_drawings ----
  if (await fs.exists(DRAWINGS_DIR)) {
    for (const entry of await fs.readdir(DRAWINGS_DIR)) {
      if (!entry.isDirectory) continue

      const layerIds = referenced.get(entry.name)
      if (!layerIds) {
        await fs.removeDir(entry.path)
        report.deletedDrawingFolders.push(entry.path)
        continue
      }

      for (const file of await fs.readdir(entry.path)) {
        if (file.isDirectory || !file.name.endsWith('.png')) continue
        const stem = file.name.slice(0, -'.png'.length)
        if (!layerIds.has(stem)) {
          await fs.remove(file.path)
          report.deletedLayerPngs.push(file.path)
        }
      }
    }
  }

  // ---- 3: v4 `<name>.canvas.assets` leftovers ----
  for (const dirPath of scan.v4AssetDirs) {
    const canvasPath = dirPath.slice(0, -'.assets'.length) // `<name>.canvas`
    const owner = scan.canvases.get(canvasPath)
    // Delete when the owner is gone (orphan) or migrated to v5 (assetId
    // present — pixels now live under _marrow/_drawings). A still-v4
    // owner keeps its folder: that IS its live pixel data.
    if (owner && owner.assetId === null) continue
    await fs.removeDir(dirPath)
    report.deletedV4AssetFolders.push(dirPath)
  }

  return report
}
