import type { FileSystemAdapter } from '@/lib/fs/types'
import { reapCanvasOrphans } from '@/lib/canvas/orphan-reaper'
import { awaitPendingCanvasSaves } from '@/lib/canvas/pending-saves'
import { useEditorStore } from '@/stores/editor'
import { toast } from '@/stores/toast'

/**
 * "Clean up drawing data" — removes orphaned canvas pixel folders, stale
 * layer PNGs, and v4 `.canvas.assets` leftovers. Refuses while a canvas tab is
 * open and waits out in-flight unmount flushes so the reaper never scans a
 * half-saved canvas.
 */
export async function cleanUpDrawingData(vaultFs: FileSystemAdapter): Promise<void> {
  const canvasOpen = useEditorStore.getState().tabs.some((t) => t.type === 'canvas')
  if (canvasOpen) {
    toast.error('Close canvas tabs first')
    return
  }
  try {
    await awaitPendingCanvasSaves()
    const report = await reapCanvasOrphans(vaultFs)
    const removed =
      report.deletedDrawingFolders.length +
      report.deletedLayerPngs.length +
      report.deletedV4AssetFolders.length
    toast.success(
      removed === 0
        ? 'Nothing to clean'
        : `Removed ${removed} unused drawing ${removed === 1 ? 'item' : 'items'}`,
    )
  } catch (err) {
    console.error('Drawing cleanup failed:', err)
    toast.error('Cleanup failed — nothing was removed')
  }
}
