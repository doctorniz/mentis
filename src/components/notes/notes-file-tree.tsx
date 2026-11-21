import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { toast } from '@/stores/toast'
import {
  CalendarDays,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  FileOutput,
  FileText,
  Folder,
  FolderPlus,
  GitFork,
  Lightbulb,
  ListTodo,
  Loader2,
  type LucideIcon,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import type { FileSystemAdapter } from '@/lib/fs'
import { fileTypes, views, useRegistryConfig } from '@/core/registries'
import { convertLabel, convertVaultFile } from '@/core/convert/convert-file'
import { detectEditorTabType, titleFromVaultPath } from '@/lib/notes/editor-tab-from-path'
import type { FileEntry } from '@/types/files'
import { listFolder } from '@/lib/notes/tree-listing'
import { vaultPathsPointToSameFile } from '@/lib/fs/vault-path-equiv'
import { createUntitledNote } from '@/lib/notes/new-note'
import { showEditor } from '@/lib/notes/show-editor'
import { collectFilePaths, renameFolder } from '@/lib/notes/folder-ops'
import { calendarDir } from '@/lib/calendar/folder'
import { chatDir } from '@/lib/chat/vault-chat-ui'
import { DEFAULT_TASK_INBOX } from '@/lib/tasks/index'
import { THOUGHTS_DIR, type VaultConfig } from '@/types/vault'
import type { ViewId } from '@/core/registries/views'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import { awaitPendingMarkdownSave } from '@/lib/notes/pending-saves'
import { reindexFilePath, isIndexableTextPath } from '@/lib/search/build-vault-index'
import { useFileTreeStore } from '@/stores/file-tree'
import { updateLinksAfterRename } from '@/lib/links/rename'
import { useEditorStore } from '@/stores/editor'
import { removeSearchDocument } from '@/lib/search/index'
import { Button } from '@/components/ui/button'
import { RenameNoteDialog } from '@/components/notes/rename-note-dialog'
import { cn } from '@/utils/cn'

const DND_TYPE = 'application/x-ink-tree-path'

/** Folders shown in the tree as a way to a page, not as a folder of files. */
const FOLDER_VIEWS = {
  calendar: { view: 'calendar', icon: CalendarDays },
  board: { view: 'board', icon: Lightbulb },
  tasks: { view: 'tasks', icon: ListTodo },
  // The saved chats' folder is the Chat page's row: its name opens the page, its arrow the chats.
  chat: { view: 'vault-chat', icon: Sparkles },
} as const satisfies Record<string, { view: ViewId; icon: LucideIcon }>

const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '')

type FolderViewKey = keyof typeof FOLDER_VIEWS

/**
 * The folders that open a page, in the order the tree pins them. Chat is among them only
 * where the pages are pinned and chat is on.
 */
function folderViewPaths(
  config: VaultConfig | null,
  withChat: boolean,
): { key: FolderViewKey; path: string }[] {
  const inbox = trimSlashes(config?.taskInbox?.trim() || DEFAULT_TASK_INBOX)
  const tasksDir = inbox.includes('/') ? inbox.slice(0, inbox.lastIndexOf('/')) : ''
  return [
    ...(withChat && views.get('vault-chat')
      ? [{ key: 'chat' as const, path: chatDir(config) }]
      : []),
    { key: 'calendar', path: calendarDir(config) },
    { key: 'tasks', path: tasksDir },
    { key: 'board', path: trimSlashes(config?.thoughtsFolder ?? '') || THOUGHTS_DIR },
  ]
}

/** The page a folder opens, if it is the Calendar, Thoughts, tasks inbox or (pinned) chat folder. */
function viewForFolder(
  path: string,
  config: VaultConfig | null,
  withChat: boolean,
): FolderViewKey | null {
  return folderViewPaths(config, withChat).find((f) => f.path && f.path === path)?.key ?? null
}

/** A folder being named in the tree: a new one inside `parent`, or an existing one renamed. */
type FolderEdit = { kind: 'new'; parent: string } | { kind: 'rename'; path: string }

function fileTitleFromPath(path: string): string {
  return titleFromVaultPath(path)
}

export function NotesFileTree({
  vaultFs,
  refreshToken = 0,
  onNoteCreated,
  starredPaths = [],
  onRequestCollapse,
  onSearchOpen,
  onGraphOpen,
  rootClassName,
  heading = 'Vault',
  pinnedViews = false,
}: {
  vaultFs: FileSystemAdapter
  /** Increment from parent to reload the tree (e.g. after creating a note elsewhere). */
  refreshToken?: number
  onNoteCreated?: () => void
  starredPaths?: string[]
  onRequestCollapse?: () => void
  onSearchOpen?: () => void
  onGraphOpen?: () => void
  rootClassName?: string
  /** The label over the tree. */
  heading?: string
  /** Pin Chat, Calendar, Tasks, Thoughts and Bookmarks at the top, whether or not their folders exist yet. */
  pinnedViews?: boolean
}) {
  // Null until the first listing arrives: an empty vault is not the same as a vault not yet read.
  const [rootEntries, setRootEntries] = useState<FileEntry[] | null>(null)
  const [renamePath, setRenamePath] = useState<string | null>(null)
  const [inlineEditPath, setInlineEditPath] = useState<string | null>(null)
  const [externalDragOver, setExternalDragOver] = useState(false)
  const dragEnterCount = useRef(0)
  const [deletePath, setDeletePath] = useState<string | null>(null)
  const [deleteIsFolder, setDeleteIsFolder] = useState(false)
  const [folderEdit, setFolderEdit] = useState<FolderEdit | null>(null)
  const config = useRegistryConfig()
  const selectedPath = useFileTreeStore((s) => s.selectedPath)
  const setSelectedPath = useFileTreeStore((s) => s.setSelectedPath)
  const openTab = useEditorStore((s) => s.openTab)
  const addRecentFile = useEditorStore((s) => s.addRecentFile)

  // Whether the root has been shown. Until it has, every listing may answer
  // from the index first: a refresh that replaces the first listing (the app
  // coming back to the front) must not leave the tree blank while a slow
  // folder is read.
  const rootShown = useRef(false)
  const refresh = useCallback(
    (isCancelled: () => boolean = () => false) => {
      const show = (entries: FileEntry[]) => {
        rootShown.current = true
        setRootEntries(entries)
      }
      const list = () => listFolder(vaultFs, '', show, isCancelled, !rootShown.current)
      // A folder that cannot be read yet (a phone still restoring access) is tried once more.
      return list().catch(
        () =>
          new Promise<void>((resolve) =>
            window.setTimeout(() => {
              if (isCancelled()) return resolve()
              list()
                .catch(() => {
                  if (!isCancelled() && !rootShown.current) setRootEntries([])
                })
                .finally(resolve)
            }, 800),
          ),
      )
    },
    [vaultFs],
  )

  useEffect(() => {
    rootShown.current = false
    setRootEntries(null)
  }, [vaultFs])

  useEffect(() => {
    let cancelled = false
    void refresh(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [refresh, refreshToken])

  async function handleNewNote() {
    const path = await createUntitledNote(vaultFs)
    onNoteCreated?.()
    setSelectedPath(path)
    openTab({
      id: crypto.randomUUID(),
      path,
      type: 'markdown',
      title: fileTitleFromPath(path),
      isDirty: false,
    })
    addRecentFile(path)
    showEditor()
  }

  function handleOpenFile(path: string) {
    setSelectedPath(path)
    addRecentFile(path)

    void (async () => {
      const type = await detectEditorTabType(vaultFs, path)
      openTab({
        id: crypto.randomUUID(),
        path,
        type,
        title: fileTitleFromPath(path),
        isDirty: false,
      })
      showEditor()
    })()
  }

  async function handleExternalImport(files: FileList, targetFolder: string) {
    if (!files.length) return
    try {
      let count = 0
      for (const file of Array.from(files)) {
        const buf = new Uint8Array(await file.arrayBuffer())
        const dest = targetFolder ? `${targetFolder}/${file.name}` : file.name
        await vaultFs.writeFile(dest, buf)
        if (isIndexableTextPath(dest)) await reindexFilePath(vaultFs, dest)
        count++
      }
      void refresh()
      onNoteCreated?.()
      toast.success(`Imported ${count} file${count !== 1 ? 's' : ''}`)
    } catch (e) {
      console.error('Import failed', e)
      toast.error('Failed to import files')
    } finally {
      dragEnterCount.current = 0
      setExternalDragOver(false)
    }
  }

  /** Move a file into a target folder via drag-and-drop */
  async function handleMoveFile(srcPath: string, destFolder: string) {
    const fileName = srcPath.split('/').pop()
    if (!fileName) return
    const newPath = destFolder ? `${destFolder}/${fileName}` : fileName
    if (vaultPathsPointToSameFile(newPath, srcPath)) return
    if ((await vaultFs.exists(newPath)) && !vaultPathsPointToSameFile(newPath, srcPath)) {
      toast.error('A file with that name already exists in the target folder')
      return
    }
    try {
      await vaultFs.rename(srcPath, newPath)
      removeSearchDocument(srcPath)
      if (isIndexableTextPath(newPath)) await reindexFilePath(vaultFs, newPath)
      const { tabs, retargetTabPath } = useEditorStore.getState()
      const tab = tabs.find((t) => t.path === srcPath)
      if (tab) retargetTabPath(tab.id, newPath, fileTitleFromPath(newPath))
      if (selectedPath === srcPath) setSelectedPath(newPath)
      void refresh()
      onNoteCreated?.()
      toast.success(`Moved to ${destFolder || 'root'}`)
    } catch (e) {
      console.error('Move failed', e)
      toast.error('Failed to move file')
    }
  }

  async function handleInlineRename(oldPath: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed) return
    const sanitized = trimmed.replace(/[/\\:*?"<>|]/g, '')
    if (!sanitized) return
    // Preserve the original file extension
    const ext = oldPath.includes('.') ? oldPath.slice(oldPath.lastIndexOf('.')) : '.md'
    const fileName = sanitized.toLowerCase().endsWith(ext.toLowerCase())
      ? sanitized
      : `${sanitized}${ext}`
    const parent = oldPath.lastIndexOf('/') === -1 ? '' : oldPath.slice(0, oldPath.lastIndexOf('/'))
    const newPath = parent ? `${parent}/${fileName}` : fileName
    if (vaultPathsPointToSameFile(newPath, oldPath)) return
    if ((await vaultFs.exists(newPath)) && !vaultPathsPointToSameFile(newPath, oldPath)) {
      toast.error('A note with that name already exists')
      return
    }
    try {
      await vaultFs.rename(oldPath, newPath)
      removeSearchDocument(oldPath)
      if (isIndexableTextPath(newPath)) await reindexFilePath(vaultFs, newPath)
      void updateLinksAfterRename(vaultFs, oldPath, newPath)
      const { tabs, retargetTabPath } = useEditorStore.getState()
      const tab = tabs.find((t) => t.path === oldPath)
      if (tab) retargetTabPath(tab.id, newPath, fileTitleFromPath(newPath))
      if (selectedPath === oldPath) setSelectedPath(newPath)
      void refresh()
      onNoteCreated?.()
    } catch (e) {
      console.error('Inline rename failed', e)
      toast.error('Failed to rename note')
    }
  }

  function requestDelete(path: string, isFolder: boolean) {
    setDeletePath(path)
    setDeleteIsFolder(isFolder)
  }

  async function handleDelete() {
    if (!deletePath) return
    try {
      // Close affected tabs FIRST and wait for their unmount flush-saves.
      // Removing the file before the flush lets the closing editor write
      // the note back from memory — a deleted-but-resurrected file.
      const { tabs, closeTab } = useEditorStore.getState()
      const affected = tabs.filter(
        (t) => t.path === deletePath || t.path.startsWith(deletePath + '/'),
      )
      for (const tab of affected) closeTab(tab.id)
      if (affected.length > 0) {
        // Let React commit the unmount so the flush promise is registered.
        await new Promise((r) => setTimeout(r, 50))
        await Promise.all(affected.map((t) => awaitPendingMarkdownSave(t.path)))
      }

      if (deleteIsFolder) {
        const files = await collectFilePaths(vaultFs, deletePath)
        for (const f of files) removeSearchDocument(f)
        await vaultFs.removeDir(deletePath)
        toast.success('Folder deleted')
      } else {
        await vaultFs.remove(deletePath)
        removeSearchDocument(deletePath)
        toast.success('Note deleted')
      }
      if (selectedPath?.startsWith(deletePath)) setSelectedPath(null)
      setDeletePath(null)
      void refresh()
      onNoteCreated?.()
    } catch (e) {
      console.error('Delete failed', e)
      toast.error(deleteIsFolder ? 'Failed to delete folder' : 'Failed to delete note')
    }
  }

  async function handleConvertFile(path: string) {
    try {
      const result = await convertVaultFile(vaultFs, path)
      void refresh()
      onNoteCreated?.()
      if (result.warning) toast.warning(result.warning)
      else toast.success(`Created ${result.path.split('/').pop()}`)
      handleOpenFile(result.path)
    } catch (e) {
      console.error('Conversion failed', e)
      toast.error('Could not convert this file')
    }
  }

  function startNewFolder(parent: string) {
    if (parent) useFileTreeStore.getState().setExpanded(parent, true)
    setFolderEdit({ kind: 'new', parent })
  }

  /** Make or rename the folder being named. Resolves to a message when it cannot, else null. */
  async function submitFolderEdit(edit: FolderEdit, name: string): Promise<string | null> {
    if (edit.kind === 'new') {
      const fullPath = edit.parent ? `${edit.parent}/${name}` : name
      if (await vaultFs.exists(fullPath)) return 'A folder with that name already exists.'
      try {
        await vaultFs.mkdir(fullPath)
        onNoteCreated?.()
        void refresh()
        return null
      } catch (err) {
        return err instanceof Error ? err.message : 'Failed to create folder.'
      }
    }

    const currentPath = edit.path
    const parent = currentPath.includes('/')
      ? currentPath.slice(0, currentPath.lastIndexOf('/'))
      : ''
    const newPath = parent ? `${parent}/${name}` : name
    if (vaultPathsPointToSameFile(newPath, currentPath)) return null
    if (await vaultFs.exists(newPath)) return 'A folder with that name already exists.'
    try {
      const oldFiles = await collectFilePaths(vaultFs, currentPath)
      await renameFolder(vaultFs, currentPath, newPath)

      const { tabs, retargetTabPath } = useEditorStore.getState()
      for (const tab of tabs) {
        if (tab.path.startsWith(currentPath + '/')) {
          const updated = newPath + tab.path.slice(currentPath.length)
          retargetTabPath(
            tab.id,
            updated,
            updated.replace(/\.md$/i, '').split('/').pop() ?? updated,
          )
        }
      }
      for (const f of oldFiles) removeSearchDocument(f)

      const sel = useFileTreeStore.getState().selectedPath
      if (sel?.startsWith(currentPath + '/') || sel === currentPath) {
        setSelectedPath(sel === currentPath ? newPath : newPath + sel.slice(currentPath.length))
      }
      onNoteCreated?.()
      void refresh()
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'Rename failed.'
    }
  }

  // Calendar, Tasks and Thoughts are listed first whether or not their folders exist yet; the
  // folder appears on disk when something is first saved in it. Nested ones stay where they are.
  const shownRoot = useMemo(() => {
    if (rootEntries === null) return null
    if (!pinnedViews) return { pinned: [], rest: rootEntries }
    const pinned = folderViewPaths(config, true).filter((f) => f.path && !f.path.includes('/'))
    const pinnedPaths = new Set(pinned.map((f) => f.path))
    return {
      pinned: pinned.map(
        (f): FileEntry =>
          rootEntries.find((e) => e.isDirectory && e.path === f.path) ?? {
            name: f.path,
            path: f.path,
            type: 'other',
            isDirectory: true,
          },
      ),
      rest: rootEntries.filter((e) => !(e.isDirectory && pinnedPaths.has(e.path))),
    }
  }, [rootEntries, pinnedViews, config])

  const renderNode = (entry: FileEntry) => (
    <TreeNode
      key={entry.path}
      entry={entry}
      depth={0}
      pinnedViews={pinnedViews}
      vaultFs={vaultFs}
      refreshToken={refreshToken}
      selectedPath={selectedPath}
      inlineEditPath={inlineEditPath}
      folderEdit={folderEdit}
      onOpenFile={handleOpenFile}
      onStartInlineEdit={setInlineEditPath}
      onCommitInlineEdit={handleInlineRename}
      onCancelInlineEdit={() => setInlineEditPath(null)}
      onRenameNote={setRenamePath}
      onDeleteItem={requestDelete}
      onRenameFolder={(path) => setFolderEdit({ kind: 'rename', path })}
      onNewSubfolder={startNewFolder}
      onSubmitFolderEdit={submitFolderEdit}
      onCloseFolderEdit={() => setFolderEdit(null)}
      onMoveFile={handleMoveFile}
      onExternalImport={handleExternalImport}
      onConvertFile={handleConvertFile}
    />
  )

  return (
    <>
      <RenameNoteDialog
        open={renamePath !== null}
        onOpenChange={(o) => !o && setRenamePath(null)}
        vaultFs={vaultFs}
        currentPath={renamePath ?? ''}
        onRenamed={() => onNoteCreated?.()}
      />
      {deletePath && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
          <div className="bg-bg border-border w-[min(100%,360px)] rounded-xl border p-5 shadow-lg">
            <h2 className="text-fg text-sm font-semibold">
              Delete {deleteIsFolder ? 'folder' : 'note'}?
            </h2>
            <p className="text-fg-secondary mt-2 text-sm">
              Are you sure you want to delete <strong>{deletePath.split('/').pop()}</strong>
              {deleteIsFolder ? ' and all its contents' : ''}? This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="text-fg-secondary hover:text-fg rounded-md px-3 py-1.5 text-sm"
                onClick={() => setDeletePath(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bg-danger text-accent-fg rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
                onClick={() => void handleDelete()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        className={cn(
          'border-border bg-bg relative flex h-full w-[min(100%,240px)] shrink-0 flex-col border-r',
          rootClassName,
        )}
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            dragEnterCount.current++
            setExternalDragOver(true)
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          dragEnterCount.current = Math.max(0, dragEnterCount.current - 1)
          if (dragEnterCount.current === 0) setExternalDragOver(false)
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DND_TYPE) || e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
          }
        }}
        onDrop={(e) => {
          dragEnterCount.current = 0
          setExternalDragOver(false)
          if (e.dataTransfer.files.length > 0 && !e.dataTransfer.types.includes(DND_TYPE)) {
            e.preventDefault()
            void handleExternalImport(e.dataTransfer.files, '')
            return
          }
          const src = e.dataTransfer.getData(DND_TYPE)
          if (!src) return
          e.preventDefault()
          void handleMoveFile(src, '')
        }}
      >
        <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {onRequestCollapse && (
              <Button
                variant="ghost"
                size="sm"
                className="text-fg-muted hover:text-fg size-7 shrink-0 p-0"
                onClick={onRequestCollapse}
                aria-label="Collapse vault tree"
                title="Collapse vault tree"
              >
                <PanelLeftClose className="size-3.5" />
              </Button>
            )}
            <span className="text-fg truncate text-xs font-semibold tracking-wide uppercase">
              {heading}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {onSearchOpen && (
              <Button
                variant="ghost"
                size="sm"
                className="text-fg-muted hover:text-fg size-7 shrink-0 p-0"
                onClick={onSearchOpen}
                aria-label="Search vault"
                title="Search (Ctrl+F)"
              >
                <Search className="size-3.5" />
              </Button>
            )}
            {onGraphOpen && (
              <Button
                variant="ghost"
                size="sm"
                className="text-fg-muted hover:text-fg size-7 shrink-0 p-0"
                onClick={onGraphOpen}
                aria-label="Open graph"
                title="Graph"
              >
                <GitFork className="size-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-fg-muted hover:text-fg size-7 shrink-0 p-0"
              onClick={() => startNewFolder('')}
              aria-label="New folder"
              title="New folder"
            >
              <FolderPlus className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-fg-muted hover:text-fg size-7 shrink-0 p-0"
              onClick={() => void handleNewNote()}
              aria-label="New note"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
        {externalDragOver && (
          <div className="border-accent bg-accent/10 pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed">
            <span className="text-accent text-xs font-semibold">Drop to import</span>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {starredPaths.length > 0 && (
            <div className="mb-2">
              <div className="text-fg-muted px-3 pt-1.5 pb-1 text-[10px] font-semibold tracking-widest uppercase">
                Starred
              </div>
              {starredPaths.map((p) => (
                <SidebarPathRow
                  key={`star-${p}`}
                  path={p}
                  selected={selectedPath === p}
                  onOpen={handleOpenFile}
                />
              ))}
            </div>
          )}
          {rootEntries === null ? (
            <div className="flex justify-center px-3 py-4" role="status" aria-label="Loading files">
              <Loader2 className="text-fg-muted size-4 animate-spin" aria-hidden />
            </div>
          ) : shownRoot &&
            shownRoot.pinned.length + shownRoot.rest.length === 0 &&
            starredPaths.length === 0 &&
            folderEdit?.kind !== 'new' ? (
            <p className="text-fg-muted px-3 py-4 text-center text-xs">No files yet.</p>
          ) : (
            <div role="tree" aria-label="Vault file tree">
              {folderEdit?.kind === 'new' && folderEdit.parent === '' && (
                <FolderNameInput
                  depth={0}
                  onSubmit={(name) => submitFolderEdit(folderEdit, name)}
                  onClose={() => setFolderEdit(null)}
                />
              )}
              {shownRoot?.pinned.map(renderNode)}
              {pinnedViews && <ViewRow id="bookmarks" />}
              {shownRoot?.rest.map(renderNode)}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function SidebarPathRow({
  path,
  selected,
  onOpen,
}: {
  path: string
  selected: boolean
  onOpen: (path: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(path)}
      className={cn(
        'mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors',
        selected ? 'bg-accent/10 text-accent font-medium' : 'text-fg hover:bg-bg-hover',
      )}
    >
      <FileText
        className={cn('size-3.5 shrink-0', selected ? 'text-accent/60' : 'text-fg-muted')}
        aria-hidden
      />
      <span className="min-w-0 truncate">{fileTitleFromPath(path)}</span>
    </button>
  )
}

const VIEW_ROW =
  'mx-1 flex w-[calc(100%-0.5rem)] items-center gap-1 rounded-md py-1 pr-1 text-left text-[13px] transition-colors'

/** A page with no folder of its own (Chat, Bookmarks), listed in the tree beside the folders that have one. */
function ViewRow({ id }: { id: ViewId }) {
  useRegistryConfig()
  const def = views.get(id)
  const active = useUiStore((s) => views.resolve(s.activeView)?.highlight === id)
  if (!def) return null
  const Icon = def.icon
  return (
    <div role="treeitem" aria-level={1} aria-selected={active}>
      <button
        type="button"
        onClick={() => useUiStore.getState().setActiveView(id)}
        className={cn(VIEW_ROW, active ? 'bg-accent/10 text-accent' : 'text-fg hover:bg-bg-hover')}
        style={{ paddingLeft: 2 }}
      >
        <span className="size-4 shrink-0" aria-hidden />
        <Icon className={cn('size-4 shrink-0', !active && 'text-fg-muted')} aria-hidden />
        <span className="min-w-0 truncate font-medium">{def.label}</span>
      </button>
    </div>
  )
}

/** The text box a folder is named in, in the row the folder will occupy. */
function FolderNameInput({
  depth,
  initial = '',
  expandable = true,
  onSubmit,
  onClose,
}: {
  depth: number
  initial?: string
  /** Leave room for the expand arrow, so the name lines up with its siblings. */
  expandable?: boolean
  /** Resolves to a message when the name cannot be used, else null. */
  onSubmit: (name: string) => Promise<string | null>
  onClose: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  // Enter commits, and the box then loses focus: only the first of the two counts.
  const settled = useRef(false)

  async function commit(fromBlur: boolean) {
    if (settled.current) return
    const name = ref.current?.value.trim() ?? ''
    if (!name || name === initial) {
      settled.current = true
      onClose()
      return
    }
    if (/[/\\]/.test(name)) {
      toast.error('A name cannot contain slashes.')
      if (fromBlur) {
        settled.current = true
        onClose()
      }
      return
    }
    settled.current = true
    const error = await onSubmit(name)
    if (!error) {
      onClose()
      return
    }
    toast.error(error)
    if (fromBlur) {
      onClose()
    } else {
      settled.current = false
      ref.current?.focus()
    }
  }

  return (
    <div
      className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-1 py-1 pr-1"
      style={{ paddingLeft: 2 + depth * 14 }}
    >
      {expandable && <span className="size-4 shrink-0" aria-hidden />}
      <Folder className="text-fg-muted size-4 shrink-0" aria-hidden />
      <input
        ref={ref}
        type="text"
        defaultValue={initial}
        placeholder="Folder name"
        aria-label={initial ? 'New folder name' : 'Folder name'}
        autoFocus
        onFocus={(e) => e.currentTarget.setSelectionRange(0, e.currentTarget.value.length)}
        onBlur={() => void commit(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit(false)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            settled.current = true
            onClose()
          }
          e.stopPropagation()
        }}
        className="text-fg bg-bg border-accent min-w-0 flex-1 rounded border px-1 py-0 text-[13px] font-medium outline-none"
      />
    </div>
  )
}

function TreeNode({
  entry,
  depth,
  pinnedViews = false,
  vaultFs,
  refreshToken,
  selectedPath,
  inlineEditPath,
  folderEdit,
  onOpenFile,
  onStartInlineEdit,
  onCommitInlineEdit,
  onCancelInlineEdit,
  onRenameNote,
  onDeleteItem,
  onRenameFolder,
  onNewSubfolder,
  onSubmitFolderEdit,
  onCloseFolderEdit,
  onMoveFile,
  onExternalImport,
  onConvertFile,
}: {
  entry: FileEntry
  depth: number
  /** A root row of a tree that pins the pages: the chat folder is then the Chat page's row. */
  pinnedViews?: boolean
  vaultFs: FileSystemAdapter
  /** Bumped when vault files change (same as parent `NotesFileTree`); reloads expanded folder children. */
  refreshToken: number
  selectedPath: string | null
  inlineEditPath: string | null
  folderEdit: FolderEdit | null
  onOpenFile: (path: string) => void
  onStartInlineEdit: (path: string) => void
  onCommitInlineEdit: (oldPath: string, newName: string) => void
  onCancelInlineEdit: () => void
  onRenameNote: (path: string) => void
  onDeleteItem: (path: string, isFolder: boolean) => void
  onRenameFolder: (path: string) => void
  onNewSubfolder: (parentPath: string) => void
  onSubmitFolderEdit: (edit: FolderEdit, name: string) => Promise<string | null>
  onCloseFolderEdit: () => void
  onMoveFile: (srcPath: string, destFolder: string) => void
  onExternalImport: (files: FileList, targetFolder: string) => void
  onConvertFile: (path: string) => void
}) {
  const expandedPaths = useFileTreeStore((s) => s.expandedPaths)
  const toggleExpanded = useFileTreeStore((s) => s.toggleExpanded)
  const toggleStarred = useFileTreeStore((s) => s.toggleStarred)
  const starred = useFileTreeStore((s) => s.starredPaths.includes(entry.path))
  const expanded = Boolean(expandedPaths[entry.path])
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inlineInputRef = useRef<HTMLInputElement>(null)
  const childrenShown = useRef(false)
  const isEditing = inlineEditPath === entry.path
  const renamingFolder = folderEdit?.kind === 'rename' && folderEdit.path === entry.path
  const newHere = folderEdit?.kind === 'new' && folderEdit.parent === entry.path
  // The Calendar, Thoughts and Tasks folders open their pages; their files are not listed.
  const folderViewId = useVaultStore((s) =>
    entry.isDirectory ? viewForFolder(entry.path, s.config, pinnedViews && depth === 0) : null,
  )
  const folderView = folderViewId ? FOLDER_VIEWS[folderViewId] : null
  // Chat is the one that still lists its files (the saved chats).
  const chatRow = folderViewId === 'chat'
  const isCalendar = folderView !== null && !chatRow
  const folderViewActive = useUiStore((s) =>
    folderView ? views.resolve(s.activeView)?.highlight === folderView.view : false,
  )

  useEffect(() => {
    if (!entry.isDirectory || !expanded || isCalendar) return
    let cancelled = false
    // A pinned folder may not exist yet (no chat saved): it lists as empty.
    void listFolder(
      vaultFs,
      entry.path,
      setChildren,
      () => cancelled,
      !childrenShown.current,
    ).catch(() => {
      if (!cancelled) setChildren([])
    })
    childrenShown.current = true
    return () => {
      cancelled = true
    }
  }, [entry.isDirectory, entry.path, expanded, vaultFs, refreshToken, isCalendar])

  if (folderView && !chatRow) {
    const FolderIcon = folderView.icon
    return (
      <div role="treeitem" aria-level={depth + 1} aria-selected={folderViewActive}>
        <button
          type="button"
          onClick={() => useUiStore.getState().setActiveView(folderView.view)}
          className={cn(
            VIEW_ROW,
            folderViewActive ? 'bg-accent/10 text-accent' : 'text-fg hover:bg-bg-hover',
          )}
          style={{ paddingLeft: 2 + depth * 14 }}
        >
          <span className="size-4 shrink-0" aria-hidden />
          <FolderIcon
            className={cn('size-4 shrink-0', !folderViewActive && 'text-fg-muted')}
            aria-hidden
          />
          <span className="min-w-0 truncate font-medium">{entry.name}</span>
        </button>
      </div>
    )
  }

  if (!entry.isDirectory) {
    const selected = selectedPath === entry.path
    const displayName = titleFromVaultPath(entry.path)
    // Icon and colour come from the file's module. Only registered types
    // reach the tree (isNotesTreeEntry), so the fallback is defensive.
    const fileDef = fileTypes.resolve(entry.path)
    const FileIcon = fileDef?.appearance.icon ?? FileText

    function commitInline() {
      const val = inlineInputRef.current?.value
      if (val != null) {
        onCommitInlineEdit(entry.path, val)
      }
      onCancelInlineEdit()
    }

    const fileRow = (
      <div
        role="treeitem"
        aria-selected={selected}
        aria-level={depth + 1}
        draggable={!isEditing}
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_TYPE, entry.path)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onKeyDown={(e) => {
          if (e.key === 'F2' && !isEditing) {
            e.preventDefault()
            onStartInlineEdit(entry.path)
          }
        }}
        className={cn(
          'group mx-1 flex w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-md py-1 pr-1 text-[13px] transition-colors',
          selected ? 'bg-accent/10 text-accent' : 'text-fg hover:bg-bg-hover',
        )}
        style={{ paddingLeft: 22 + depth * 14 }} /* icons line up with the folders' */
      >
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <FileIcon className="text-fg-muted size-3.5 shrink-0" aria-hidden />
            <input
              ref={inlineInputRef}
              type="text"
              defaultValue={displayName}
              autoFocus
              onFocus={(e) => {
                const el = e.currentTarget
                el.setSelectionRange(0, el.value.length)
              }}
              onBlur={commitInline}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitInline()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  onCancelInlineEdit()
                }
                e.stopPropagation()
              }}
              className="text-fg bg-bg border-accent min-w-0 flex-1 rounded border px-1 py-0 text-[13px] outline-none"
            />
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onOpenFile(entry.path)}
              onDoubleClick={(e) => {
                e.preventDefault()
                if (fileDef?.renameOnDoubleClick) onStartInlineEdit(entry.path)
              }}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-1.5 py-0 text-left',
                selected && 'font-medium',
              )}
            >
              <FileIcon
                className={cn(
                  'size-3.5 shrink-0',
                  selected ? 'text-accent/60' : 'text-fg-muted',
                  fileDef?.appearance.treeClass,
                )}
                aria-hidden
              />
              <span className="min-w-0 truncate">{displayName}</span>
            </button>
            <button
              type="button"
              className={cn(
                'shrink-0 rounded p-1 transition-opacity md:opacity-0 md:group-hover:opacity-100',
                starred ? 'text-accent opacity-100' : 'text-fg-muted hover:text-fg opacity-100',
              )}
              aria-label={starred ? 'Remove star' : 'Star note'}
              onClick={(e) => {
                e.stopPropagation()
                toggleStarred(entry.path)
              }}
            >
              <Star className={cn('size-3.5', starred && 'fill-current')} aria-hidden />
            </button>
            <button
              type="button"
              className="text-fg-muted hover:text-fg shrink-0 rounded p-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
              aria-label={`Rename ${entry.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onStartInlineEdit(entry.path)
              }}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              className="text-fg-muted shrink-0 rounded p-1 opacity-100 transition-opacity hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
              aria-label={`Delete ${entry.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onDeleteItem(entry.path, false)
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
    )

    return (
      <TreeContextMenu
        isFile
        entryName={entry.name}
        starred={starred}
        onOpen={() => onOpenFile(entry.path)}
        onRename={() => onStartInlineEdit(entry.path)}
        onStar={() => toggleStarred(entry.path)}
        convertLabel={convertLabel(entry.path)}
        onConvert={() => onConvertFile(entry.path)}
        onDelete={() => onDeleteItem(entry.path, false)}
      >
        {fileRow}
      </TreeContextMenu>
    )
  }

  const folderRow = (
    <div
      className={cn(
        'group mx-1 flex w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-md py-1 pr-1 text-[13px] transition-colors',
        dragOver ? 'bg-accent/15 ring-accent/40 ring-1' : 'hover:bg-bg-hover',
      )}
      style={{ paddingLeft: 2 + depth * 14 }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_TYPE) || e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={(e) => {
        setDragOver(false)
        if (e.dataTransfer.files.length > 0 && !e.dataTransfer.types.includes(DND_TYPE)) {
          e.preventDefault()
          e.stopPropagation()
          onExternalImport(e.dataTransfer.files, entry.path)
          return
        }
        const src = e.dataTransfer.getData(DND_TYPE)
        if (!src) return
        e.preventDefault()
        e.stopPropagation()
        onMoveFile(src, entry.path)
      }}
    >
      {chatRow && folderView ? (
        <>
          <button
            type="button"
            onClick={() => toggleExpanded(entry.path)}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
            className="text-fg-muted shrink-0 rounded"
          >
            {expanded ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={() => useUiStore.getState().setActiveView(folderView.view)}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-1 text-left',
              folderViewActive ? 'text-accent' : 'text-fg',
            )}
          >
            <folderView.icon
              className={cn('size-4 shrink-0', !folderViewActive && 'text-fg-muted')}
              aria-hidden
            />
            <span className="min-w-0 truncate font-medium">{entry.name}</span>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => toggleExpanded(entry.path)}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
          className="text-fg flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="text-fg-muted size-4 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="text-fg-muted size-4 shrink-0" aria-hidden />
          )}
          <Folder className="text-fg-muted size-4 shrink-0" aria-hidden />
          <span className="min-w-0 truncate font-medium">{entry.name}</span>
        </button>
      )}
      {!chatRow && (
        <>
          <button
            type="button"
            className="text-fg-muted hover:text-fg shrink-0 rounded p-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
            aria-label={`New subfolder in ${entry.name}`}
            title="New subfolder"
            onClick={(e) => {
              e.stopPropagation()
              onNewSubfolder(entry.path)
            }}
          >
            <FolderPlus className="size-3.5" />
          </button>
          <button
            type="button"
            className="text-fg-muted hover:text-fg shrink-0 rounded p-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
            aria-label={`Rename ${entry.name}`}
            title="Rename folder"
            onClick={(e) => {
              e.stopPropagation()
              onRenameFolder(entry.path)
            }}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            className="text-fg-muted shrink-0 rounded p-1 opacity-100 transition-opacity hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
            aria-label={`Delete ${entry.name}`}
            title="Delete folder"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteItem(entry.path, true)
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        </>
      )}
    </div>
  )

  return (
    <div
      role="treeitem"
      aria-expanded={expanded}
      aria-level={depth + 1}
      aria-selected={selectedPath === entry.path}
    >
      {renamingFolder ? (
        <FolderNameInput
          depth={depth}
          initial={entry.name}
          onSubmit={(name) => onSubmitFolderEdit(folderEdit, name)}
          onClose={onCloseFolderEdit}
        />
      ) : chatRow ? (
        folderRow
      ) : (
        <TreeContextMenu
          isFile={false}
          entryName={entry.name}
          onRename={() => onRenameFolder(entry.path)}
          onNewSubfolder={() => onNewSubfolder(entry.path)}
          onDelete={() => onDeleteItem(entry.path, true)}
        >
          {folderRow}
        </TreeContextMenu>
      )}
      {expanded && (newHere || (children && children.length > 0)) && (
        <div role="group">
          {newHere && (
            <FolderNameInput
              depth={depth + 1}
              onSubmit={(name) => onSubmitFolderEdit(folderEdit, name)}
              onClose={onCloseFolderEdit}
            />
          )}
          {children?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              vaultFs={vaultFs}
              refreshToken={refreshToken}
              selectedPath={selectedPath}
              inlineEditPath={inlineEditPath}
              folderEdit={folderEdit}
              onOpenFile={onOpenFile}
              onStartInlineEdit={onStartInlineEdit}
              onCommitInlineEdit={onCommitInlineEdit}
              onCancelInlineEdit={onCancelInlineEdit}
              onRenameNote={onRenameNote}
              onDeleteItem={onDeleteItem}
              onRenameFolder={onRenameFolder}
              onNewSubfolder={onNewSubfolder}
              onSubmitFolderEdit={onSubmitFolderEdit}
              onCloseFolderEdit={onCloseFolderEdit}
              onMoveFile={onMoveFile}
              onExternalImport={onExternalImport}
              onConvertFile={onConvertFile}
            />
          ))}
        </div>
      )}
      {expanded && !newHere && children && children.length === 0 && (
        <p className="text-fg-muted py-1 text-xs" style={{ paddingLeft: 28 + depth * 14 }}>
          Empty folder
        </p>
      )}
    </div>
  )
}

const CTX_ROW =
  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm outline-none transition-colors cursor-pointer data-[highlighted]:bg-bg-hover'

function TreeContextMenu({
  children,
  isFile,
  entryName,
  starred,
  onOpen,
  onRename,
  onStar,
  onNewSubfolder,
  convertLabel,
  onConvert,
  onDelete,
}: {
  children: React.ReactNode
  isFile: boolean
  entryName: string
  starred?: boolean
  onOpen?: () => void
  onRename: () => void
  onStar?: () => void
  onNewSubfolder?: () => void
  convertLabel?: string
  onConvert?: () => void
  onDelete: () => void
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          // Closing the menu must not hand focus back to the row: Rename opens a text box there.
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="border-border-strong bg-bg z-50 min-w-[180px] rounded-lg border p-1 shadow-lg"
        >
          {isFile && onOpen && (
            <ContextMenu.Item className={CTX_ROW} onSelect={onOpen}>
              <ExternalLink className="size-4" />
              Open
            </ContextMenu.Item>
          )}
          {isFile && onStar && (
            <ContextMenu.Item className={CTX_ROW} onSelect={onStar}>
              <Star className={cn('size-4', starred && 'fill-current')} />
              {starred ? 'Unstar' : 'Star'}
            </ContextMenu.Item>
          )}
          <ContextMenu.Item className={CTX_ROW} onSelect={onRename}>
            <Pencil className="size-4" />
            Rename
          </ContextMenu.Item>
          {isFile && convertLabel && onConvert && (
            <ContextMenu.Item className={CTX_ROW} onSelect={onConvert}>
              <FileOutput className="size-4" />
              {convertLabel}
            </ContextMenu.Item>
          )}
          {!isFile && onNewSubfolder && (
            <ContextMenu.Item className={CTX_ROW} onSelect={onNewSubfolder}>
              <FolderPlus className="size-4" />
              New subfolder
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="bg-border my-1 h-px" />
          <ContextMenu.Item
            className={`${CTX_ROW} text-danger data-[highlighted]:bg-danger/10`}
            onSelect={onDelete}
          >
            <Trash2 className="size-4" />
            Delete {isFile ? entryName : 'folder'}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
