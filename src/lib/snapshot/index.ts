import type { FileSystemAdapter } from '@/lib/fs'
import type { SnapshotConfig } from '@/types/vault'
import { SNAPSHOTS_DIR } from '@/types/vault'

export interface SnapshotInfo {
  path: string
  originalFile: string
  timestamp: string
  size: number
}

/**
 * Snapshots of `Work/Report.pdf` live in `_mentis/snapshots/files/Work/`, so
 * PDFs with the same name in different folders keep separate histories.
 * Older snapshots sit directly in `_mentis/snapshots/` and are matched by
 * file name alone, since their folder was not recorded.
 */
const BY_PATH_DIR = `${SNAPSHOTS_DIR}/files`

function splitPdfPath(pdfPath: string): { dir: string; name: string } {
  const p = pdfPath.replace(/^\/+/, '')
  const slash = p.lastIndexOf('/')
  return slash >= 0 ? { dir: p.slice(0, slash), name: p.slice(slash + 1) } : { dir: '', name: p }
}

function snapshotDirFor(pdfPath: string): string {
  const { dir } = splitPdfPath(pdfPath)
  return dir ? `${BY_PATH_DIR}/${dir}` : BY_PATH_DIR
}

const stemOf = (name: string) => name.replace(/\.pdf$/i, '')

function getSnapshotFilename(originalPath: string): string {
  const name = stemOf(splitPdfPath(originalPath).name) || 'unknown'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${name}_${timestamp}.pdf`
}

/**
 * Parse the encoded ISO timestamp back into a Date.
 * Format: `YYYY-MM-DDTHH-mm-ss-mmmZ` → `YYYY-MM-DDTHH:mm:ss.mmmZ`
 */
export function parseSnapshotTimestamp(ts: string): Date | null {
  const tIdx = ts.indexOf('T')
  if (tIdx < 0) return null
  const datePart = ts.slice(0, tIdx)
  const timePart = ts.slice(tIdx + 1).replace('Z', '')
  const parts = timePart.split('-')
  if (parts.length < 4) return null
  const iso = `${datePart}T${parts[0]}:${parts[1]}:${parts[2]}.${parts[3]}Z`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

export async function createSnapshot(fs: FileSystemAdapter, pdfPath: string): Promise<string> {
  const dir = snapshotDirFor(pdfPath)
  const snapshotPath = `${dir}/${getSnapshotFilename(pdfPath)}`
  await fs.mkdir(dir)
  await fs.copy(pdfPath, snapshotPath)
  return snapshotPath
}

/** `Report_<timestamp>.pdf` → its parts; null for anything else. */
function parseSnapshotEntry(path: string, name: string, size: number): SnapshotInfo | null {
  if (!/\.pdf$/i.test(name)) return null
  const stem = stemOf(name)
  const cut = stem.lastIndexOf('_')
  if (cut <= 0) return null
  return {
    path,
    originalFile: `${stem.slice(0, cut)}.pdf`,
    timestamp: stem.slice(cut + 1),
    size,
  }
}

async function snapshotsIn(fs: FileSystemAdapter, dir: string): Promise<SnapshotInfo[]> {
  let entries
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: SnapshotInfo[] = []
  for (const e of entries) {
    if (e.isDirectory) continue
    const info = parseSnapshotEntry(e.path, e.name, e.size ?? 0)
    if (info) out.push(info)
  }
  return out
}

/** Every snapshot, in every folder under the snapshots folder. */
async function allSnapshots(fs: FileSystemAdapter, dir = SNAPSHOTS_DIR): Promise<SnapshotInfo[]> {
  let entries
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: SnapshotInfo[] = []
  for (const e of entries) {
    if (e.isDirectory) out.push(...(await allSnapshots(fs, `${dir}/${e.name}`)))
    else {
      const info = parseSnapshotEntry(e.path, e.name, e.size ?? 0)
      if (info) out.push(info)
    }
  }
  return out
}

const newestFirst = (a: SnapshotInfo, b: SnapshotInfo) => b.timestamp.localeCompare(a.timestamp)

/**
 * Snapshots of the PDF at `pdfPath` (vault-relative), newest first; with no
 * path, every snapshot.
 */
export async function listSnapshots(
  fs: FileSystemAdapter,
  pdfPath?: string,
): Promise<SnapshotInfo[]> {
  if (pdfPath === undefined) return (await allSnapshots(fs)).sort(newestFirst)
  const name = splitPdfPath(pdfPath).name
  const mine = (s: SnapshotInfo) => s.originalFile === name
  const [byPath, older] = await Promise.all([
    snapshotsIn(fs, snapshotDirFor(pdfPath)),
    snapshotsIn(fs, SNAPSHOTS_DIR),
  ])
  return [...byPath.filter(mine), ...older.filter(mine)].sort(newestFirst)
}

/**
 * Restore a snapshot: copy the snapshot over the original file.
 * Creates a safety snapshot of the current file first.
 */
export async function restoreSnapshot(
  fs: FileSystemAdapter,
  snapshotPath: string,
  originalPdfPath: string,
): Promise<void> {
  await createSnapshot(fs, originalPdfPath)
  const bytes = await fs.readFile(snapshotPath)
  await fs.writeFile(originalPdfPath, bytes)
}

export async function deleteSnapshot(fs: FileSystemAdapter, snapshotPath: string): Promise<void> {
  await fs.remove(snapshotPath)
}

/**
 * Keep the newest `maxPerFile` snapshots of each PDF and none older than
 * `retentionDays`. Snapshots of PDFs that were deleted age out the same way.
 */
export async function pruneSnapshots(fs: FileSystemAdapter, config: SnapshotConfig): Promise<void> {
  const byFile = new Map<string, SnapshotInfo[]>()
  for (const snap of await allSnapshots(fs)) {
    const key = `${snap.path.slice(0, snap.path.lastIndexOf('/'))}/${snap.originalFile}`
    byFile.set(key, [...(byFile.get(key) ?? []), snap])
  }

  const cutoff = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000

  for (const snapshots of byFile.values()) {
    snapshots.sort(newestFirst)
    for (let i = 0; i < snapshots.length; i++) {
      const snap = snapshots[i]
      const taken = parseSnapshotTimestamp(snap.timestamp)
      const isOverLimit = i >= config.maxPerFile
      const isExpired = taken !== null && taken.getTime() < cutoff
      if (isOverLimit || isExpired) {
        try {
          await fs.remove(snap.path)
        } catch {
          // Non-fatal — snapshot may already be deleted
        }
      }
    }
  }
}
