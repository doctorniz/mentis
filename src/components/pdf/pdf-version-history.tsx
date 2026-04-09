'use client'

import { useCallback, useEffect, useState } from 'react'
import { History, RotateCcw, Trash2 } from 'lucide-react'
import type { FileSystemAdapter } from '@/lib/fs'
import {
  listSnapshots,
  restoreSnapshot,
  deleteSnapshot,
  parseSnapshotTimestamp,
  type SnapshotInfo,
} from '@/lib/snapshot'
import { toast } from '@/stores/toast'
import { cn } from '@/utils/cn'

interface Props {
  pdfPath: string
  vaultFs: FileSystemAdapter
  onRestore: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTimestamp(ts: string): string {
  const date = parseSnapshotTimestamp(ts)
  if (!date) return ts
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)

  let relative: string
  if (diffMin < 1) relative = 'just now'
  else if (diffMin < 60) relative = `${diffMin}m ago`
  else if (diffHr < 24) relative = `${diffHr}h ago`
  else if (diffDay < 7) relative = `${diffDay}d ago`
  else relative = date.toLocaleDateString()

  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${day} at ${time} (${relative})`
}

export function PdfVersionHistory({ pdfPath, vaultFs, onRestore }: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const pdfFilename = pdfPath.split('/').pop() ?? pdfPath

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const snaps = await listSnapshots(vaultFs, pdfFilename)
      setSnapshots(snaps)
    } catch {
      setSnapshots([])
    } finally {
      setLoading(false)
    }
  }, [vaultFs, pdfFilename])

  useEffect(() => { void refresh() }, [refresh])

  async function handleRestore(snap: SnapshotInfo) {
    setRestoring(snap.path)
    try {
      await restoreSnapshot(vaultFs, snap.path, pdfPath)
      toast.success('Snapshot restored — reloading PDF')
      await refresh()
      onRestore()
    } catch (e) {
      console.error('Restore failed', e)
      toast.error('Failed to restore snapshot')
    } finally {
      setRestoring(null)
    }
  }

  async function handleDelete(snap: SnapshotInfo) {
    try {
      await deleteSnapshot(vaultFs, snap.path)
      toast.success('Snapshot deleted')
      setConfirmDelete(null)
      await refresh()
    } catch (e) {
      console.error('Delete failed', e)
      toast.error('Failed to delete snapshot')
    }
  }

  return (
    <div className="border-border bg-bg-secondary flex w-64 shrink-0 flex-col border-r">
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        <History className="text-fg-secondary size-4" />
        <h3 className="text-fg text-xs font-semibold">Version History</h3>
        <span className="text-fg-muted ml-auto text-xs">{snapshots.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-fg-muted px-3 py-6 text-center text-xs">Loading…</div>
        ) : snapshots.length === 0 ? (
          <div className="text-fg-muted px-3 py-6 text-center text-xs">
            No snapshots yet.
            <br />
            <span className="text-fg-muted/70">
              A snapshot is created automatically before the first edit in each session.
            </span>
          </div>
        ) : (
          <ul className="flex flex-col">
            {snapshots.map((snap) => (
              <li
                key={snap.path}
                className="border-border hover:bg-bg-hover group border-b px-3 py-2.5"
              >
                <div className="text-fg text-xs font-medium leading-tight">
                  {formatTimestamp(snap.timestamp)}
                </div>
                <div className="text-fg-muted mt-0.5 text-[10px]">
                  {formatBytes(snap.size)}
                </div>

                <div className="mt-1.5 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    title="Restore this version"
                    disabled={restoring === snap.path}
                    onClick={() => void handleRestore(snap)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                      'bg-accent/10 text-accent hover:bg-accent/20',
                      restoring === snap.path && 'animate-pulse',
                    )}
                  >
                    <RotateCcw className="size-3" />
                    {restoring === snap.path ? 'Restoring…' : 'Restore'}
                  </button>

                  {confirmDelete === snap.path ? (
                    <span className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => void handleDelete(snap)}
                        className="text-red-500 hover:text-red-600 font-medium"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="text-fg-muted hover:text-fg"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      title="Delete this snapshot"
                      aria-label="Delete this snapshot"
                      onClick={() => setConfirmDelete(snap.path)}
                      className="text-fg-muted hover:text-red-500 rounded p-0.5 transition-colors"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
