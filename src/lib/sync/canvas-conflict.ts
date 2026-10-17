/**
 * A drawing is a `.canvas` file plus one PNG per layer under
 * `_mentis/_drawings/<assetId>/`. Sync moves each file on its own, so when
 * both sides edited a drawing, per-file conflict copies are useless: a copy
 * of the `.canvas` file still points at the winner's pixels, and a copy of a
 * layer PNG is a stray file the orphan reaper deletes. These helpers save the
 * losing side of a drawing whole instead: its `.canvas` file under a new
 * asset id, with every layer PNG copied under that id.
 */

import { CANVAS_DRAWINGS_DIR } from '@/lib/canvas/constants'
import { canvasDrawingsLayerPath } from '@/lib/canvas/serializer'

const DRAWINGS_PREFIX = `${CANVAS_DRAWINGS_DIR}/`

export function isCanvasPath(path: string): boolean {
  return path.toLowerCase().endsWith('.canvas')
}

/** The asset id of a layer file (`_mentis/_drawings/<id>/<layer>.png`), else null. */
export function drawingAssetOf(path: string): string | null {
  if (!path.startsWith(DRAWINGS_PREFIX)) return null
  const parts = path.slice(DRAWINGS_PREFIX.length).split('/')
  return parts.length === 2 && parts[0] ? parts[0] : null
}

/** Whether a conflict on `path` concerns a drawing as a whole. */
export function isDrawingPath(path: string): boolean {
  return isCanvasPath(path) || drawingAssetOf(path) !== null
}

interface CanvasRefs {
  assetId: string
  layerIds: string[]
}

/** The asset id and layer ids of a `.canvas` file that keeps its pixels under
 *  `_mentis/_drawings` (version 5 on); null for older or unreadable files. */
export function canvasRefs(bytes: Uint8Array): CanvasRefs | null {
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes)) as {
      version?: unknown
      assetId?: unknown
      layers?: unknown
    }
    if (typeof json.version !== 'number' || json.version < 5) return null
    if (typeof json.assetId !== 'string' || !json.assetId) return null
    const layers = Array.isArray(json.layers) ? json.layers : []
    const layerIds = layers
      .map((l) => (l && typeof l === 'object' ? (l as { id?: unknown }).id : null))
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    return { assetId: json.assetId, layerIds }
  } catch {
    return null
  }
}

/**
 * The files of a conflict copy of the drawing at `canvasPath`, as read from
 * the losing side by `read`: the `.canvas` file at `copyPath` pointing at
 * `newAssetId`, and each layer PNG under that id. Layers whose PNG the side
 * does not have are left out (an empty layer). Null when the drawing is not
 * one these copies can be made for; the caller falls back to per-file copies.
 */
export async function canvasConflictCopy(opts: {
  canvasPath: string
  copyPath: string
  newAssetId: string
  read: (path: string) => Promise<Uint8Array | null>
}): Promise<Map<string, Uint8Array> | null> {
  const canvas = await opts.read(opts.canvasPath)
  if (!canvas) return null
  const refs = canvasRefs(canvas)
  if (!refs) return null

  const files = new Map<string, Uint8Array>()
  for (const layerId of refs.layerIds) {
    const png = await opts.read(canvasDrawingsLayerPath(refs.assetId, layerId))
    if (png) files.set(canvasDrawingsLayerPath(opts.newAssetId, layerId), png)
  }
  const json = JSON.parse(new TextDecoder().decode(canvas)) as Record<string, unknown>
  json.assetId = opts.newAssetId
  // Written last, so a copy is never seen pointing at pixels not yet written.
  files.set(opts.copyPath, new TextEncoder().encode(JSON.stringify(json, null, 2)))
  return files
}
