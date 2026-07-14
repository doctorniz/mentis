import type { FileSystemAdapter } from '@/lib/fs'
import type { SnapshotConfig } from '@/types/vault'
import { SNAPSHOTS_DIR } from '@/types/vault'

export interface SnapshotInfo {
  path: string
  originalFile: string
  timestamp: string
  size: number
}

function getSnapshotFilename(originalPath: string): string {
  const name = originalPath.split('/').pop()?.replace('.pdf', '') ?? 'unknown'
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
  const filename = getSnapshotFilename(pdfPath)
  const snapshotPath = `${SNAPSHOTS_DIR}/${filename}`

  await fs.copy(pdfPath, snapshotPath)
  return snapshotPath
}

export async function listSnapshots(
  fs: FileSystemAdapter,
  originalFilename?: string,
): Promise<SnapshotInfo[]> {
  let entries
  try {
    entries = await fs.readdir(SNAPSHOTS_DIR)
  } catch {
    return []
  }

  return entries
    .filter((entry) => {
      if (entry.isDirectory) return false
      if (!entry.name.endsWith('.pdf')) return false
      if (originalFilename) {
        const baseName = originalFilename.replace('.pdf', '')
        return entry.name.startsWith(baseName + '_')
      }
      return true
    })
    .map((entry) => {
      const parts = entry.name.replace('.pdf', '').split('_')
      const timestampStr = parts.pop() ?? ''

      return {
        path: entry.path,
        originalFile: parts.join('_') + '.pdf',
        timestamp: timestampStr,
        size: entry.size ?? 0,
      }
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
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

function groupByOriginal(snapshots: SnapshotInfo[]): Map<string, SnapshotInfo[]> {
  const byFile = new Map<string, SnapshotInfo[]>()
  for (const snap of snapshots) {
    const existing = byFile.get(snap.originalFile) ?? []
    existing.push(snap)
    byFile.set(snap.originalFile, existing)
  }
  return byFile
}

/**
 * From one file's snapshots, pick those to delete: any beyond `maxPerFile`
 * (keeping the newest) or older than `retentionDays`. `snapshots` need not
 * be pre-sorted. An unparsable timestamp is treated as not-expired so a
 * snapshot we cannot date is never deleted on age grounds.
 */
function selectPrunable(snapshots: SnapshotInfo[], config: SnapshotConfig): SnapshotInfo[] {
  const sorted = [...snapshots].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - config.retentionDays)

  const doomed: SnapshotInfo[] = []
  for (let i = 0; i < sorted.length; i++) {
    const snap = sorted[i]
    const isOverLimit = i >= config.maxPerFile
    const parsed = parseSnapshotTimestamp(snap.timestamp)
    const isExpired = parsed !== null && parsed < cutoff
    if (isOverLimit || isExpired) doomed.push(snap)
  }
  return doomed
}

export async function pruneSnapshots(fs: FileSystemAdapter, config: SnapshotConfig): Promise<void> {
  const byFile = groupByOriginal(await listSnapshots(fs))

  for (const [, snapshots] of byFile) {
    for (const snap of selectPrunable(snapshots, config)) {
      try {
        await fs.remove(snap.path)
      } catch {
        // Non-fatal — snapshot may already be deleted
      }
    }
  }
}

const PDF_EXT = '.pdf'

/**
 * Recursively collect the basenames of every live `.pdf` in the vault.
 * `_marrow` is skipped: it holds no user PDFs, and descending would count
 * the snapshots themselves (which are `.pdf`) as their own owners.
 */
async function collectPdfBasenames(fs: FileSystemAdapter, dir: string, acc: Set<string>): Promise<void> {
  for (const entry of await fs.readdir(dir)) {
    if (entry.name.startsWith('_marrow')) continue
    if (entry.isDirectory) {
      await collectPdfBasenames(fs, entry.path, acc)
    } else if (entry.name.endsWith(PDF_EXT)) {
      acc.add(entry.name)
    }
  }
}

export interface SnapshotReapReport {
  /** Snapshot files found in `_marrow/snapshots`. */
  scannedSnapshots: number
  /** Removed snapshots whose owner PDF no longer exists anywhere in the vault. */
  deletedOrphans: string[]
  /** Removed snapshots of LIVE owners that exceeded maxPerFile / retentionDays. */
  deletedPruned: string[]
}

/**
 * Full-vault snapshot sweep for the Settings → Maintenance cleanup.
 *
 * Two kinds of dead weight accumulate in `_marrow/snapshots` (see the V1
 * deferral):
 *
 *   1. Orphans — snapshots of a PDF that has since been deleted. A snapshot
 *      only records its owner's basename, so it is an orphan iff NO `.pdf`
 *      with that basename exists anywhere in the vault.
 *   2. Overflow — snapshots of a still-live owner beyond `maxPerFile` or
 *      older than `retentionDays` (the per-edit `pruneSnapshots` also caps
 *      these, but only for files edited this session).
 *
 * SAFETY — the live-PDF scan happens fully before any deletion, so a
 * `readdir` failure propagates and deletes nothing (a snapshot must never
 * look orphaned because we failed to enumerate its owner). Individual
 * removals fail soft (the file may already be gone).
 */
export async function reapSnapshots(
  fs: FileSystemAdapter,
  config: SnapshotConfig,
): Promise<SnapshotReapReport> {
  const livePdfs = new Set<string>()
  await collectPdfBasenames(fs, '', livePdfs)

  const byFile = groupByOriginal(await listSnapshots(fs))
  let scanned = 0
  const report: SnapshotReapReport = { scannedSnapshots: 0, deletedOrphans: [], deletedPruned: [] }

  for (const [originalFile, snapshots] of byFile) {
    scanned += snapshots.length

    if (!livePdfs.has(originalFile)) {
      // Owner is gone — every snapshot in this group is an orphan.
      for (const snap of snapshots) {
        try {
          await fs.remove(snap.path)
          report.deletedOrphans.push(snap.path)
        } catch {
          // Non-fatal — snapshot may already be deleted.
        }
      }
      continue
    }

    for (const snap of selectPrunable(snapshots, config)) {
      try {
        await fs.remove(snap.path)
        report.deletedPruned.push(snap.path)
      } catch {
        // Non-fatal.
      }
    }
  }

  report.scannedSnapshots = scanned
  return report
}
