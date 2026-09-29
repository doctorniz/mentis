import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
// KaTeX's stylesheet, bundled locally: its @font-face rules register at the
// document level, which the shadow-root preview can use. Marp is told not to
// point KaTeX fonts at a CDN (katexFontPath: false) so decks render offline.
import 'katex/dist/katex.min.css'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useEditorStore } from '@/stores/editor'
import { useAutoSave } from '@/hooks/use-auto-save'
import { InlineFileTitle } from '@/components/shell/inline-file-title'
import { inkEditorTheme, inkHighlightStyle } from '@/lib/code/codemirror-theme'
import { renderSlidesInWorker } from '@/core/render/slides-client'
import { reindexFilePath } from '@/lib/search/build-vault-index'
import { toast } from '@/stores/toast'
import type { FileEditorProps } from '@/core/registries/file-types'

const SUFFIX = '.slides.md'
const PREVIEW_DEBOUNCE_MS = 150

/** Laid out as a vertical strip of slides, each scaled to the pane width. */
const PREVIEW_CSS = `
  :host { display: block; }
  div.marpit { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
  div.marpit > svg {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  }
`

async function renderInto(root: ShadowRoot, source: string, isCurrent: () => boolean) {
  try {
    const rendered = await renderSlidesInWorker(source)
    if (!rendered || !isCurrent()) return
    root.innerHTML = `<style>${rendered.css}</style><style>${PREVIEW_CSS}</style>${rendered.html}`
  } catch (e) {
    console.error('Slide render failed', e)
  }
}

/** Marp deck editor: markdown source on the left, live slides on the right. */
export default function SlidesFileEditor({
  tabId,
  path,
  renameFile,
  notifySaved,
}: FileEditorProps) {
  const { vaultFs } = useVaultSession()
  const markDirty = useEditorStore((s) => s.markDirty)
  const isDirty = useEditorStore((s) => s.tabs.find((t) => t.id === tabId)?.isDirty ?? false)
  const sourceRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<ShadowRoot | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const renderTimerRef = useRef<number>(0)
  const pathRef = useRef(path)
  const [loaded, setLoaded] = useState(false)

  // After a rename the host retargets the tab; saves must follow the new path.
  pathRef.current = path

  const handleSave = useCallback(async () => {
    const view = viewRef.current
    if (!view) return
    try {
      await vaultFs.writeTextFile(pathRef.current, view.state.doc.toString())
      markDirty(tabId, false)
      void reindexFilePath(vaultFs, pathRef.current)
      notifySaved()
    } catch (e) {
      console.error('Slides save failed', e)
      toast.error('Failed to save slides')
    }
  }, [vaultFs, markDirty, tabId, notifySaved])

  useAutoSave({ intervalMs: 3_000, saveOnBlur: true, enabled: true, onSave: handleSave, isDirty })

  // Create the editor once per tab; renames are handled through pathRef.
  useEffect(() => {
    const host = previewRef.current
    if (host && !shadowRef.current) shadowRef.current = host.attachShadow({ mode: 'open' })

    let destroyed = false
    let view: EditorView | null = null

    void (async () => {
      let text: string
      try {
        text = await vaultFs.readTextFile(path)
      } catch (e) {
        console.error('Slides load failed', e)
        toast.error('Failed to open slides')
        return
      }
      if (destroyed || !sourceRef.current) return

      view = new EditorView({
        parent: sourceRef.current,
        state: EditorState.create({
          doc: text,
          extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightActiveLine(),
            drawSelection(),
            highlightSelectionMatches(),
            history(),
            markdown(),
            keymap.of([
              ...defaultKeymap,
              ...historyKeymap,
              ...searchKeymap,
              indentWithTab,
              {
                key: 'Mod-s',
                run: () => {
                  void handleSave()
                  return true
                },
              },
            ]),
            inkEditorTheme,
            inkHighlightStyle,
            EditorView.lineWrapping,
            EditorView.updateListener.of((update) => {
              if (!update.docChanged) return
              markDirty(tabId, true)
              window.clearTimeout(renderTimerRef.current)
              renderTimerRef.current = window.setTimeout(() => {
                if (shadowRef.current)
                  void renderInto(shadowRef.current, update.state.doc.toString(), () => !destroyed)
              }, PREVIEW_DEBOUNCE_MS)
            }),
          ],
        }),
      })
      viewRef.current = view
      if (shadowRef.current) void renderInto(shadowRef.current, text, () => !destroyed)
      setLoaded(true)
    })()

    return () => {
      destroyed = true
      window.clearTimeout(renderTimerRef.current)
      view?.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // Flush unsaved edits when the tab closes or the editor unmounts.
  useEffect(() => {
    return () => {
      const view = viewRef.current
      if (!view) return
      const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId)
      if (!tab?.isDirty) return
      void vaultFs.writeTextFile(pathRef.current, view.state.doc.toString()).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <InlineFileTitle
          path={path}
          onRename={(oldPath, newStem) => renameFile(tabId, oldPath, newStem, SUFFIX)}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          ref={sourceRef}
          aria-label="Slide source"
          className="border-border min-h-0 flex-1 overflow-auto border-b md:border-r md:border-b-0"
        />
        <div className="bg-bg-tertiary min-h-0 flex-1 overflow-auto">
          <div ref={previewRef} data-testid="slides-preview" aria-label="Slide preview" />
          {!loaded && <p className="text-fg-muted p-4 text-sm">Loading slides…</p>}
        </div>
      </div>
    </div>
  )
}
