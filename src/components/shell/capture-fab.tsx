import { lazy, Suspense, useState } from 'react'
import { Plus } from 'lucide-react'
import { views } from '@/core/registries'
import { useEditorStore } from '@/stores/editor'
import { useUiStore } from '@/stores/ui'

const CaptureSheet = lazy(() => import('./capture-sheet'))

/** Views with their own bar or controls in that corner: Thoughts' capture bar, Chat's send. */
const HIDDEN_IN: ReadonlySet<string> = new Set(['board', 'vault-chat'])

/**
 * Capture on a wide screen: a button in the bottom right of every view that
 * opens the capture bar over it. Phones have Capture in the tab bar instead.
 */
export function CaptureFab() {
  const viewId = useUiStore((s) => views.resolve(s.activeView)?.def.id)
  // A canvas keeps its zoom controls in that corner.
  const onCanvas = useEditorStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.type === 'canvas',
  )
  const [open, setOpen] = useState(false)

  const hidden = (viewId !== undefined && HIDDEN_IN.has(viewId)) || (onCanvas && viewId === 'vault')

  return (
    <>
      {!hidden && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Capture"
          title="Capture"
          className="bg-accent text-accent-fg hover:bg-accent/90 fixed right-6 bottom-6 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-colors"
        >
          <Plus className="size-6" aria-hidden />
        </button>
      )}
      {open && (
        <Suspense fallback={null}>
          <CaptureSheet onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
