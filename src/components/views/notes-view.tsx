import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { FileText } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { vaultPathsPointToSameFile } from '@/lib/fs/vault-path-equiv'
import { NotesWorkspaceProvider, useNotesWorkspace } from '@/contexts/notes-workspace-context'
import { EditorTabBar } from '@/components/notes/editor-tab-bar'
import { ChatPanel } from '@/components/chat/chat-panel'
import { EditorRightColumn } from '@/components/notes/editor-right-column'
import { BacklinksSection } from '@/components/notes/backlinks-section'
import { OutlineSection } from '@/components/notes/outline-section'
import { ensureChatAssetIdForPath, movePdfChatAssetId } from '@/lib/chat/asset-index'
import { fileTypes, titleForPath } from '@/core/registries'
import type { FileEditorHandle } from '@/core/registries/file-types'
import { lazyEditorFor, preloadEditor } from '@/core/registries/lazy-editor'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { useUiStore } from '@/stores/ui'
import { Button } from '@/components/ui/button'
import { CANVAS_SIDEBAR_MEDIA_QUERY } from '@/lib/browser/breakpoints'
import { useMediaQuery } from '@/lib/browser/use-media-query'
import { createUntitledNote } from '@/lib/notes/new-note'
import { detectEditorTabType, titleFromVaultPath } from '@/lib/notes/editor-tab-from-path'
import { toast } from '@/stores/toast'
import { removeSearchDocument } from '@/lib/search/index'
import { reindexFilePath, isIndexableTextPath } from '@/lib/search/build-vault-index'

export function NotesView() {
  const { vaultFs } = useVaultSession()
  return (
    <NotesWorkspaceProvider vaultFs={vaultFs}>
      <NotesViewInner />
    </NotesWorkspaceProvider>
  )
}

function NotesViewInner() {
  const [scanPulse, setScanPulse] = useState(0)
  const { vaultFs } = useVaultSession()
  const { markdownPaths, refreshMarkdownPaths } = useNotesWorkspace()

  const tabs = useEditorStore((s) => s.tabs)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const openTab = useEditorStore((s) => s.openTab)
  const addRecentFile = useEditorStore((s) => s.addRecentFile)
  const retargetTabPath = useEditorStore((s) => s.retargetTabPath)
  const pendingVaultOpenPath = useEditorStore((s) => s.pendingVaultOpenPath)
  const setPendingVaultOpenPath = useEditorStore((s) => s.setPendingVaultOpenPath)
  const setSelectedPath = useFileTreeStore((s) => s.setSelectedPath)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  // Unknown ids open as markdown, as unknown files always have.
  const activeDef = activeTab
    ? (fileTypes.get(activeTab.type) ?? fileTypes.get('markdown'))
    : undefined

  // Most tabs are notes: fetch the markdown editor while the vault settles so
  // the first open doesn't wait on the chunk.
  useEffect(() => {
    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(() => preloadEditor('markdown'))
        : window.setTimeout(() => preloadEditor('markdown'), 200)
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
    }
  }, [])

  async function handleRenameVaultFile(
    tabId: string,
    oldPath: string,
    newNameStem: string,
    ext: string,
  ) {
    const sanitized = newNameStem.replace(/[/\\:*?"<>|]/g, '').trim()
    if (!sanitized) return
    const fullName = sanitized.endsWith(ext) ? sanitized : `${sanitized}${ext}`
    const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : ''
    const newPath = parent ? `${parent}/${fullName}` : fullName
    if (vaultPathsPointToSameFile(newPath, oldPath)) return
    if ((await vaultFs.exists(newPath)) && !vaultPathsPointToSameFile(newPath, oldPath)) {
      toast.error('A file with that name already exists')
      return
    }
    try {
      await vaultFs.rename(oldPath, newPath)
      removeSearchDocument(oldPath)
      if (isIndexableTextPath(newPath)) await reindexFilePath(vaultFs, newPath)
      // Types whose chatAssetId lives in the path-keyed chat index — migrate
      // the entry so chat threads follow the rename. (Renames that miss this
      // are healed later by fingerprint reconciliation.)
      if (fileTypes.resolve(newPath)?.layout?.chat === 'index') {
        await movePdfChatAssetId(vaultFs, oldPath, newPath).catch(() => undefined)
      }
      retargetTabPath(tabId, newPath, titleForPath(newPath))
      setSelectedPath(newPath)
      vaultChanged()
    } catch {
      toast.error('Failed to rename')
    }
  }

  const vaultChanged = useCallback(() => {
    useFileTreeStore.getState().refreshTree()
    void refreshMarkdownPaths()
  }, [refreshMarkdownPaths])

  const openNotePath = useCallback(
    (path: string) => {
      setSelectedPath(path)
      addRecentFile(path)

      void (async () => {
        const type = await detectEditorTabType(vaultFs, path)
        openTab({
          id: crypto.randomUUID(),
          path,
          type,
          title: titleFromVaultPath(path),
          isDirty: false,
        })
      })()
    },
    [addRecentFile, openTab, setSelectedPath, vaultFs],
  )

  const bumpScan = useCallback(() => {
    setScanPulse((n) => n + 1)
    // Notify the graph view (and any other listener) that vault content changed
    window.dispatchEvent(new CustomEvent('ink:vault-changed'))
  }, [])

  // Collapsible backlinks section (lives inside the unified right column
  // for markdown tabs). Persisted so the user's choice survives reloads.
  const BACKLINKS_COLLAPSED_KEY = 'mentis:backlinks-collapsed'
  const [backlinksCollapsed, setBacklinksCollapsed] = useState(true)
  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(BACKLINKS_COLLAPSED_KEY)
      if (raw === '0') setBacklinksCollapsed(false)
    } catch {
      /* localStorage unavailable */
    }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(BACKLINKS_COLLAPSED_KEY, backlinksCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [backlinksCollapsed])

  // Collapsible headings outline — same persistence pattern as backlinks.
  const OUTLINE_COLLAPSED_KEY = 'mentis:outline-collapsed'
  const [outlineCollapsed, setOutlineCollapsed] = useState(true)
  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(OUTLINE_COLLAPSED_KEY)
      if (raw === '0') setOutlineCollapsed(false)
    } catch {
      /* localStorage unavailable */
    }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(OUTLINE_COLLAPSED_KEY, outlineCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [outlineCollapsed])

  // Live editor of the active markdown tab, reported by MarkdownNoteEditor
  // so the outline panel can read headings without a save round-trip.
  const [activeEditorInstance, setActiveEditorInstance] = useState<unknown>(null)

  // Chat collapsed state — collapsed = just a header bar at the bottom.
  const CHAT_COLLAPSED_KEY = 'mentis:chat-collapsed'
  const [chatCollapsed, setChatCollapsed] = useState(true)
  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_COLLAPSED_KEY)
      if (raw === '0') setChatCollapsed(false)
    } catch {
      /* localStorage unavailable */
    }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_COLLAPSED_KEY, chatCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [chatCollapsed])

  // Right column collapsed state — collapsed = thin rail with icons.
  const COLUMN_COLLAPSED_KEY = 'mentis:right-column-collapsed'
  const [columnCollapsed, setColumnCollapsed] = useState(false)
  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_COLLAPSED_KEY)
      if (raw === '1') setColumnCollapsed(true)
    } catch {
      /* localStorage unavailable */
    }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_COLLAPSED_KEY, columnCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [columnCollapsed])

  // Chat panel — always present in the right column. Markdown tabs use
  // frontmatter via `MarkdownNoteEditor.ensureChatAssetId`; PDFs use
  // `_mentis/_chats/index.json`. The asset id is resolved eagerly
  // whenever the active tab changes so chat is ready without a toggle.
  const [chatAssetIdByPath, setChatAssetIdByPath] = useState<Record<string, string>>({})

  const onMarkdownChatAssetIdFromDisk = useCallback((notePath: string, chatAssetId: string) => {
    setChatAssetIdByPath((m) =>
      m[notePath] === chatAssetId ? m : { ...m, [notePath]: chatAssetId },
    )
  }, [])

  // Ensure chatAssetId for the active markdown tab once its editor is mounted.
  // The editor is loaded lazily, so its handle arrives whenever the chunk does;
  // this ref callback runs at that moment, and again for the next tab's path.
  const editorChatPath = activeDef?.layout?.chat === 'editor' ? activeTab?.path : undefined
  const setEditorHandle = useCallback(
    (handle: FileEditorHandle | null) => {
      if (!handle || !editorChatPath) return
      const id = handle.ensureChatAssetId?.()
      if (id) {
        setChatAssetIdByPath((m) => (m[editorChatPath] === id ? m : { ...m, [editorChatPath]: id }))
      }
    },
    [editorChatPath],
  )

  // Auto-ensure chatAssetId for the active PDF tab.
  useEffect(() => {
    if (!activeTab || activeDef?.layout?.chat !== 'index') return
    if (chatAssetIdByPath[activeTab.path]) return
    void ensureChatAssetIdForPath(vaultFs, activeTab.path)
      .then((id) => {
        setChatAssetIdByPath((m) => ({ ...m, [activeTab.path]: id }))
      })
      .catch(() => {
        // Silently fail — chat will show "not configured" state.
      })
    // Same rationale as above for activeTab; chatAssetIdByPath is read only as a
    // guard against re-fetching and is set by this effect itself for this path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.path, activeTab?.type, vaultFs])

  const isCanvasSidebarNarrow = useMediaQuery(CANVAS_SIDEBAR_MEDIA_QUERY)
  const isCanvasTab = activeDef?.layout?.narrow === 'canvas'

  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  const isSidebarOpen = useUiStore((s) => s.isSidebarOpen)
  const canvasSidebarAutoCollapsedRef = useRef(false)

  // Auto-collapse nav sidebar for canvas tabs at ≤1050px. Restores when
  // the tab changes away from canvas or the viewport widens again.
  useEffect(() => {
    if (!isCanvasTab) {
      if (canvasSidebarAutoCollapsedRef.current) {
        canvasSidebarAutoCollapsedRef.current = false
        setSidebarOpen(true)
      }
      return
    }
    if (isCanvasSidebarNarrow && isSidebarOpen) {
      canvasSidebarAutoCollapsedRef.current = true
      setSidebarOpen(false)
    } else if (!isCanvasSidebarNarrow && !isSidebarOpen && canvasSidebarAutoCollapsedRef.current) {
      canvasSidebarAutoCollapsedRef.current = false
      setSidebarOpen(true)
    }
  }, [isCanvasTab, isCanvasSidebarNarrow, isSidebarOpen, setSidebarOpen])

  async function handleNewNote() {
    const path = await createUntitledNote(vaultFs)
    vaultChanged()
    openNotePath(path)
  }

  // Refresh the tree whenever any part of the app creates/renames/deletes a vault file
  useEffect(() => {
    const handler = () => vaultChanged()
    window.addEventListener('ink:vault-changed', handler)
    return () => window.removeEventListener('ink:vault-changed', handler)
  }, [vaultChanged])

  // Open a vault file requested while another view was active (Board → Vault).
  useEffect(() => {
    if (!pendingVaultOpenPath) return
    const p = pendingVaultOpenPath
    setPendingVaultOpenPath(null)
    openNotePath(p)
  }, [pendingVaultOpenPath, setPendingVaultOpenPath, openNotePath])

  const ActiveEditor = activeDef ? lazyEditorFor(activeDef) : undefined
  const editorElement =
    activeTab && ActiveEditor ? (
      // Blank while a type's chunk loads for the first time — no spinner text,
      // so a fast load shows nothing at all.
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <ActiveEditor
          key={activeTab.id}
          tabId={activeTab.id}
          path={activeTab.path}
          isNew={activeTab.isNew}
          refreshTree={vaultChanged}
          notifySaved={bumpScan}
          renameFile={(tabId, oldPath, stem, ext) =>
            void handleRenameVaultFile(tabId, oldPath, stem, ext)
          }
          openFile={openNotePath}
          linkTargets={markdownPaths}
          onEditorReady={setActiveEditorInstance}
          onChatAssetIdFromDisk={onMarkdownChatAssetIdFromDisk}
          handleRef={setEditorHandle}
        />
      </Suspense>
    ) : null

  return (
    <div className="relative flex h-full min-h-0 w-full">
      <div className="bg-bg flex min-h-0 min-w-0 flex-1 flex-col">
        <EditorTabBar />
        {activeTab && activeDef && ActiveEditor ? (
          activeDef.layout?.rightColumn ? (
            // Keyed by type, not tab: switching between two tabs of the same type
            // keeps the column (and its chat panel) mounted; only the editor below
            // remounts. Switching type remounts, so the width storage key is re-read.
            <div key={`column:${activeDef.id}`} className="relative flex min-h-0 flex-1">
              <EditorRightColumn
                storageKey={activeDef.layout.rightColumn.storageKey}
                defaultRightPx={activeDef.layout.rightColumn.defaultRightPx}
                minRightPx={activeDef.layout.rightColumn.minRightPx}
                maxRightRatio={0.6}
                columnCollapsed={columnCollapsed}
                onColumnCollapsedChange={setColumnCollapsed}
                chat={
                  chatAssetIdByPath[activeTab.path] ? (
                    <ChatPanel
                      chatAssetId={chatAssetIdByPath[activeTab.path]}
                      documentPath={activeTab.path}
                      collapsed={chatCollapsed}
                      onCollapsedChange={setChatCollapsed}
                    />
                  ) : null
                }
                trailing={
                  activeDef.layout.rightColumn.outline || activeDef.layout.rightColumn.backlinks ? (
                    <>
                      {activeDef.layout.rightColumn.outline && (
                        <OutlineSection
                          editor={activeEditorInstance as TiptapEditor | null}
                          collapsed={outlineCollapsed}
                          onCollapsedChange={setOutlineCollapsed}
                          maxExpandedHeightClass={
                            chatCollapsed && backlinksCollapsed ? 'flex-1' : 'max-h-[35%]'
                          }
                        />
                      )}
                      {activeDef.layout.rightColumn.backlinks && (
                        <BacklinksSection
                          markdownPaths={markdownPaths}
                          activeNotePath={activeTab.path}
                          scanPulse={scanPulse}
                          onOpenNote={openNotePath}
                          collapsed={backlinksCollapsed}
                          onCollapsedChange={setBacklinksCollapsed}
                          maxExpandedHeightClass={
                            chatCollapsed && outlineCollapsed ? 'flex-1' : 'max-h-[40%]'
                          }
                        />
                      )}
                    </>
                  ) : undefined
                }
              >
                {editorElement}
              </EditorRightColumn>
            </div>
          ) : (
            editorElement
          )
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8">
            <div className="bg-bg-tertiary flex size-16 items-center justify-center rounded-2xl">
              <FileText className="text-fg-muted size-8 stroke-[1.25]" aria-hidden />
            </div>
            <div className="max-w-xs text-center">
              <p className="text-fg text-sm font-semibold">No file open</p>
              <p className="text-fg-secondary mt-1.5 text-sm leading-relaxed">
                Pick a file from the sidebar or create a new one. Edits auto-save.
              </p>
            </div>
            <Button type="button" onClick={() => void handleNewNote()}>
              New note
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
