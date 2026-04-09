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

export async function createSnapshot(
  fs: FileSystemAdapter,
  pdfPath: string,
): Promise<string> {
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

export async function deleteSnapshot(
  fs: FileSystemAdapter,
  snapshotPath: string,
): Promise<void> {
  await fs.remove(snapshotPath)
}

export async function pruneSnapshots(
  fs: FileSystemAdapter,
  config: SnapshotConfig,
): Promise<void> {
  const allSnapshots = await listSnapshots(fs)

  const byFile = new Map<string, SnapshotInfo[]>()
  for (const snap of allSnapshots) {
    const existing = byFile.get(snap.originalFile) ?? []
    existing.push(snap)
    byFile.set(snap.originalFile, existing)
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays)

  for (const [, snapshots] of byFile) {
    const sorted = snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    for (let i = 0; i < sorted.length; i++) {
      const snap = sorted[i]
      const isOverLimit = i >= config.maxPerFile
      const isExpired = new Date(snap.timestamp) < cutoffDate

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
