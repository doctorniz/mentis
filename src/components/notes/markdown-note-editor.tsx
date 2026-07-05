'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { getNoteEditorExtensions } from '@/lib/editor/tiptap-extensions'
import { setImageVaultFs } from '@/lib/editor/vault-image-extension'
import { setVideoVaultFs } from '@/lib/editor/vault-video-extension'
import { setPdfEmbedVaultFs } from '@/lib/editor/pdf-embed-extension'
import { markdownToTiptapJSON, tiptapJSONToMarkdown } from '@/lib/editor/markdown-bridge'
import { parseNote, resolveWikiLinkPath, serializeNote } from '@/lib/markdown'
import { reindexMarkdownPath } from '@/lib/search/build-vault-index'
import { removeSearchDocument } from '@/lib/search/index'
import { saveAsset, assetToBlobUrl } from '@/lib/notes/assets'
import type { FileEntry } from '@/types/files'
import { buildExportHtml, printExportHtml } from '@/lib/notes/export-pdf'
import { downloadTextFile } from '@/lib/browser/download-file'
import { vaultPathsPointToSameFile } from '@/lib/fs/vault-path-equiv'
import type { NoteFrontmatter } from '@/types/editor'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { useVaultStore } from '@/stores/vault'
import { toast } from '@/stores/toast'
import { cn } from '@/utils/cn'
import { Mic } from 'lucide-react'
import { AudioPlayer } from '@/components/audio/audio-player'
import { NoteEditorToolbar } from '@/components/notes/note-editor-toolbar'
import type { InsertImageFn } from '@/components/notes/note-editor-toolbar'
import { NoteEditorModeBar } from '@/components/notes/note-editor-mode-bar'
import { MarkdownSourceEditor } from '@/components/notes/markdown-source-editor'
import { TableControlsMenu } from '@/components/notes/table-controls-menu'
import { FindReplaceBar } from '@/components/notes/find-replace-bar'
import { countWords } from '@/lib/notes/word-count'
import { useSyncPush } from '@/contexts/sync-context'

/**
 * Tracks the in-flight unmount-save flush per vault path so the next mount
 * of the same path can await it before reading the file from disk — the
 * same race the canvas editor guards against with `pendingCanvasSaves`.
 * Without this, closing a tab and immediately reopening the same note can
 * read stale bytes and overwrite the edit that was still being written.
 */
const pendingMarkdownSaves = new Map<string, Promise<void>>()

/** Flatten a FileEntry tree into vault-relative paths (files only, no dirs) */
function flattenFilePaths(entry: FileEntry | null, depth = 0): string[] {
  if (!entry) return []
  if (!entry.isDirectory) return [entry.path]
  if (depth > 20) return []
  return (entry.children ?? []).flatMap((c) => flattenFilePaths(c, depth + 1))
}

function titleFromPath(p: string): string {
  return p.replace(/\.md$/i, '').split('/').pop() ?? p
}

function parentDir(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

function voiceAttachmentFromFrontmatter(
  fm: NoteFrontmatter,
): { path: string; duration: number | null } | null {
  const ap = fm.audioPath
  if (typeof ap !== 'string' || !ap.trim()) return null
  const ad = fm.audioDuration
  return {
    path: ap.trim(),
    duration: typeof ad === 'number' ? ad : null,
  }
}

function NoteVoiceAttachment({
  vaultPath,
  durationSec,
}: {
  vaultPath: string
  durationSec: number | null
}) {
  const { vaultFs } = useVaultSession()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    assetToBlobUrl(vaultFs, vaultPath)
      .then((u) => {
        url = u
        setBlobUrl(u)
      })
      .catch(() => {
        /* missing asset */
      })
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [vaultFs, vaultPath])

  if (!blobUrl) return null

  return (
    <div
      className="border-border bg-bg-secondary/60 mb-4 rounded-xl border px-4 py-3"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="text-fg-muted mb-2 flex items-center gap-1.5 text-[10px] font-medium tracking-wider uppercase">
        <Mic className="size-3" aria-hidden />
        Recording
      </div>
      <AudioPlayer src={blobUrl} duration={durationSec ?? undefined} compact />
    </div>
  )
}

/** Strip characters that are illegal in file names on any major OS */
function sanitizeTitle(raw: string): string {
  return raw
    .replace(/[/\\:*?"<>|]/g, '') // illegal on Windows / POSIX
    .replace(/\s+/g, ' ') // collapse runs of whitespace
    .trim()
}

export interface MarkdownNoteEditorHandle {
  /**
   * Returns the document's `chatAssetId`, minting a new UUID into the
   * in-memory frontmatter and scheduling a save if one wasn't already
   * present. Used by the chat panel to find its sidecar folder.
   */
  ensureChatAssetId: () => string
}

export const MarkdownNoteEditor = forwardRef<
  MarkdownNoteEditorHandle,
  {
    tabId: string
    path: string
    markdownPaths: string[]
    onOpenNotePath: (path: string) => void
    onPersisted?: () => void
    onRenamed?: () => void
    /**
     * After the note loads from disk, reports the authoritative chat folder id
     * (frontmatter `chatAssetId`). Unblocks syncing the chat panel when
     * `ensureChatAssetId` ran early while loading and minted a stale id.
     */
    onChatAssetIdFromDisk?: (path: string, chatAssetId: string) => void
    /**
     * Reports the live Tiptap editor once it exists (and null on unmount)
     * so siblings outside this component — the outline panel — can read
     * the document without a save round-trip.
     */
    onEditorReady?: (editor: Editor | null) => void
  }
>(function MarkdownNoteEditor(
  {
    tabId,
    path,
    markdownPaths,
    onOpenNotePath,
    onPersisted,
    onRenamed,
    onChatAssetIdFromDisk,
    onEditorReady,
  },
  ref,
) {
  const { vaultFs } = useVaultSession()
  const syncPush = useSyncPush()
  const markDirty = useEditorStore((s) => s.markDirty)
  const updateTab = useEditorStore((s) => s.updateTab)
  const attachmentFolder = useVaultStore((s) => s.config?.attachmentFolder ?? '_assets')
  const fileTreeRoot = useFileTreeStore((s) => s.root)
  const allPaths = useMemo(() => flattenFilePaths(fileTreeRoot), [fileTreeRoot])
  const showRawSource = useEditorStore(
    (s) => s.tabs.find((t) => t.id === tabId)?.showRawSource ?? false,
  )
  const isNew = useEditorStore((s) => s.tabs.find((t) => t.id === tabId)?.isNew ?? false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const [rawText, setRawText] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [findOpen, setFindOpen] = useState(false)
  const [findInitialTerm, setFindInitialTerm] = useState('')
  const [findFocusPulse, setFindFocusPulse] = useState(0)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [voiceAttach, setVoiceAttach] = useState<{ path: string; duration: number | null } | null>(
    null,
  )
  const [inlineTitle, setInlineTitle] = useState(() => titleFromPath(path))
  const inlineTitleRef = useRef(inlineTitle)
  inlineTitleRef.current = inlineTitle
  const pathsRef = useRef(markdownPaths)
  const pathRef = useRef(path)
  const onOpenNotePathRef = useRef(onOpenNotePath)
  const onPersistedRef = useRef(onPersisted)
  const onChatAssetIdFromDiskRef = useRef(onChatAssetIdFromDisk)
  const attachmentFolderRef = useRef(attachmentFolder)
  pathsRef.current = markdownPaths
  pathRef.current = path
  onOpenNotePathRef.current = onOpenNotePath
  onPersistedRef.current = onPersisted
  onChatAssetIdFromDiskRef.current = onChatAssetIdFromDisk
  attachmentFolderRef.current = attachmentFolder

  useEffect(() => {
    setImageVaultFs(vaultFs)
    setVideoVaultFs(vaultFs)
    setPdfEmbedVaultFs(vaultFs)
  }, [vaultFs])

  const extensions = useMemo(
    () =>
      getNoteEditorExtensions(
        'Write something…',
        {
          getMarkdownPaths: () => pathsRef.current,
          currentNotePath: () => pathRef.current,
        },
        { liveEditor: true },
      ),
    [],
  )
  const editorRef = useRef<Editor | null>(null)
  const loadingRef = useRef(true)
  const frontmatterRef = useRef<NoteFrontmatter>({})
  /**
   * Holds a `chatAssetId` minted before the on-disk frontmatter has
   * finished loading. The bootstrap effect merges it into
   * `frontmatterRef.current` once the disk state is available so the
   * next save carries the id to disk.
   */
  const pendingChatAssetIdRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabIdRef = useRef(tabId)
  const showRawRef = useRef(showRawSource)
  const rawTextRef = useRef('')
  /** Scroll container of the visual editor (the overflow-y-auto column). */
  const visualScrollRef = useRef<HTMLDivElement | null>(null)
  /** Scroll container inside MarkdownSourceEditor (CodeMirror host). */
  const sourceScrollRef = useRef<HTMLDivElement | null>(null)
  /** 0–1 scroll fraction carried across a visual→source mode switch. */
  const modeSwitchScrollFractionRef = useRef<number | null>(null)
  // Only surface one "failed to save" toast per outage — repeated auto-save
  // attempts while the user keeps typing would otherwise re-toast every
  // 750ms. Cleared as soon as a save succeeds.
  const saveFailureToastShownRef = useRef(false)

  pathRef.current = path
  tabIdRef.current = tabId
  showRawRef.current = showRawSource
  rawTextRef.current = rawText

  const scheduleSaveRef = useRef<() => void>(() => {})

  scheduleSaveRef.current = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void (async () => {
        try {
          if (showRawRef.current) {
            await vaultFs.writeTextFile(pathRef.current, rawTextRef.current)
          } else {
            const ed = editorRef.current
            if (!ed || loadingRef.current) return
            const body = tiptapJSONToMarkdown(ed.getJSON())
            const raw = serializeNote(frontmatterRef.current, body)
            await vaultFs.writeTextFile(pathRef.current, raw)
          }
          syncPush(pathRef.current)
          markDirty(tabIdRef.current, false)
          onPersistedRef.current?.()
          void reindexMarkdownPath(vaultFs, pathRef.current)
          saveFailureToastShownRef.current = false
        } catch (e) {
          console.error('Save failed', e)
          if (!saveFailureToastShownRef.current) {
            saveFailureToastShownRef.current = true
            toast.error('Failed to save note')
          }
        }
      })()
    }, 750)
  }

  const insertImageFiles = useRef(async (files: File[], editorInstance: Editor) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      try {
        const data = new Uint8Array(await file.arrayBuffer())
        const assetPath = await saveAsset(vaultFs, file.name, data, attachmentFolderRef.current)
        editorInstance
          .chain()
          .focus()
          .insertContent({
            type: 'image',
            attrs: { src: assetPath, alt: file.name },
          })
          .run()
      } catch (e) {
        console.error('Failed to save image asset', e)
        toast.error('Failed to embed image')
      }
    }
  })

  /** Called by toolbar image dialog: path is already saved in vault */
  const handleInsertImage: InsertImageFn = useCallback(
    async (vaultPath: string, fileName: string) => {
      const ed = editorRef.current
      if (!ed) return
      // If the path was just uploaded it's already on disk; just insert the node.
      ed.chain()
        .focus()
        .insertContent({
          type: 'image',
          attrs: { src: vaultPath, alt: fileName },
        })
        .run()
      markDirty(tabIdRef.current, true)
      scheduleSaveRef.current()
    },
    [markDirty],
  )

  /** Called by toolbar video dialog: insert a vaultVideo node */
  const handleInsertVideo = useCallback(
    (vaultPath: string) => {
      const ed = editorRef.current
      if (!ed) return
      const title = vaultPath.split('/').pop() ?? vaultPath
      ed.chain()
        .focus()
        .insertContent({
          type: 'vaultVideo',
          attrs: { src: vaultPath, title },
        })
        .run()
      markDirty(tabIdRef.current, true)
      scheduleSaveRef.current()
    },
    [markDirty],
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    editorProps: {
      attributes: {
        class: cn(
          'tiptap-editor focus:outline-none',
          'min-h-[min(480px,calc(100vh-14rem))] flex-1 px-10 pb-6 pt-2',
        ),
        'aria-label': 'Note content',
        role: 'textbox',
        'aria-multiline': 'true',
      },
      handleDrop(_view, event) {
        const files = Array.from(event.dataTransfer?.files ?? [])
        const images = files.filter((f) => f.type.startsWith('image/'))
        if (images.length === 0) return false
        event.preventDefault()
        const ed = editorRef.current
        if (ed) void insertImageFiles.current(images, ed)
        return true
      },
      handlePaste(_view, event) {
        const files = Array.from(event.clipboardData?.files ?? [])
        const images = files.filter((f) => f.type.startsWith('image/'))
        if (images.length === 0) return false
        event.preventDefault()
        const ed = editorRef.current
        if (ed) void insertImageFiles.current(images, ed)
        return true
      },
      handleDOMEvents: {
        click(_view, event) {
          const el = (event.target as HTMLElement).closest('[data-type="wiki-link"]')
          if (el && event.button === 0) {
            event.preventDefault()
            const rawTarget = el.getAttribute('data-target')?.trim()
            if (rawTarget) {
              const pageRef = rawTarget.match(/^(.*)#page=(\d+(?:-\d+)?)$/)
              const stem = pageRef ? pageRef[1]!.trim() : rawTarget
              const resolved = resolveWikiLinkPath(stem, pathsRef.current)
              if (resolved) onOpenNotePathRef.current(resolved)
            }
            return true
          }

          // Regular `<a>` links: Link is configured with openOnClick:false
          // so the mark stays inert on a plain click (needed to place the
          // cursor / select text like any other inline content). Ctrl/Cmd
          // or middle click opens it, matching Notion/Obsidian convention.
          const link = (event.target as HTMLElement).closest('a[href]')
          if (link && event.button === 0 && (event.ctrlKey || event.metaKey)) {
            const href = link.getAttribute('href')
            if (href) {
              event.preventDefault()
              window.open(href, '_blank', 'noopener,noreferrer')
            }
            return true
          }
          return false
        },
        auxclick(_view, event) {
          if (event.button !== 1) return false
          const link = (event.target as HTMLElement).closest('a[href]')
          if (!link) return false
          const href = link.getAttribute('href')
          if (href) {
            event.preventDefault()
            window.open(href, '_blank', 'noopener,noreferrer')
          }
          return true
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      setWordCount(countWords(ed.getText()))
      if (loadingRef.current || showRawRef.current) return
      markDirty(tabIdRef.current, true)
      scheduleSaveRef.current()
    },
  })

  const onEditorReadyRef = useRef(onEditorReady)
  onEditorReadyRef.current = onEditorReady

  useEffect(() => {
    editorRef.current = editor
    if (editor) {
      onEditorReadyRef.current?.(editor)
      return () => onEditorReadyRef.current?.(null)
    }
  }, [editor])

  // Imperative handle for the chat panel: mint `chatAssetId` on demand
  // and schedule a save so the UUID lands in frontmatter on disk. Minting
  // is one-shot — subsequent calls return the same id that's already in
  // `frontmatterRef.current`.
  useImperativeHandle(
    ref,
    () => ({
      ensureChatAssetId: () => {
        const existing = frontmatterRef.current.chatAssetId
        if (typeof existing === 'string' && existing.length > 0) {
          return existing
        }
        if (pendingChatAssetIdRef.current) return pendingChatAssetIdRef.current

        const id = crypto.randomUUID()
        if (loadingRef.current) {
          // Bootstrap hasn't loaded the on-disk frontmatter yet — stash
          // the id; the load effect will merge it on completion.
          pendingChatAssetIdRef.current = id
          return id
        }
        frontmatterRef.current = {
          ...frontmatterRef.current,
          chatAssetId: id,
        }
        markDirty(tabIdRef.current, true)
        scheduleSaveRef.current()
        return id
      },
    }),
    [markDirty],
  )

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!showRawSource)
  }, [editor, showRawSource])

  useEffect(() => {
    if (!editor) return
    let cancelled = false
    loadingRef.current = true

    setIsBootstrapping(true)
    void (async () => {
      try {
        // If a previous mount of this same path is still flushing its
        // unmount save, wait for it — otherwise this load can read stale
        // bytes and clobber the edit that write was still persisting.
        const prior = pendingMarkdownSaves.get(path)
        if (prior) {
          try {
            await prior
          } catch {
            /* best-effort */
          }
          if (cancelled) return
        }

        const fileRaw = await vaultFs.readTextFile(path)
        if (cancelled) return
        const doc = parseNote(path, fileRaw)
        // If chat minted an id while we were loading, merge it in now
        // and schedule a save so the id lands on disk.
        if (pendingChatAssetIdRef.current && !doc.frontmatter.chatAssetId) {
          doc.frontmatter.chatAssetId = pendingChatAssetIdRef.current
          markDirty(tabIdRef.current, true)
          scheduleSaveRef.current()
        }
        pendingChatAssetIdRef.current = null
        frontmatterRef.current = doc.frontmatter
        const diskChatId = doc.frontmatter.chatAssetId
        if (
          typeof diskChatId === 'string' &&
          diskChatId.length > 0 &&
          onChatAssetIdFromDiskRef.current
        ) {
          onChatAssetIdFromDiskRef.current(path, diskChatId)
        }
        setVoiceAttach(voiceAttachmentFromFrontmatter(doc.frontmatter))
        const title =
          (typeof doc.frontmatter.title === 'string' && doc.frontmatter.title) ||
          path.replace(/\.md$/i, '').split('/').pop() ||
          path

        const inRawMode =
          useEditorStore.getState().tabs.find((t) => t.id === tabId)?.showRawSource ?? false

        if (inRawMode) {
          setRawText(fileRaw)
          setWordCount(countWords(doc.content))
        } else {
          const json = markdownToTiptapJSON(doc.content)
          editor.commands.setContent(json, false)
          setWordCount(countWords(editor.getText()))
        }
        setInlineTitle(title)
        updateTab(tabId, { title, isDirty: false })
      } catch (e) {
        console.error(e)
        toast.error('Failed to load note')
        setVoiceAttach(null)
        setWordCount(0)
        if (!useEditorStore.getState().tabs.find((t) => t.id === tabId)?.showRawSource) {
          editor.commands.setContent(markdownToTiptapJSON(''), false)
        } else {
          setRawText('')
        }
      } finally {
        if (!cancelled) {
          loadingRef.current = false
          setIsBootstrapping(false)
        }
      }
    })()

    return () => {
      cancelled = true
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (pathRef.current !== path) return

      // Snapshot everything the flush needs now — refs may be reused or
      // reset by the time this async work actually runs.
      const ed = editorRef.current
      const wasRaw = showRawRef.current
      const rawSnapshot = rawTextRef.current
      const fm = frontmatterRef.current
      const wasLoading = loadingRef.current

      const run = async () => {
        try {
          if (wasRaw) {
            await vaultFs.writeTextFile(path, rawSnapshot)
          } else if (ed && !wasLoading) {
            const body = tiptapJSONToMarkdown(ed.getJSON())
            const raw = serializeNote(fm, body)
            await vaultFs.writeTextFile(path, raw)
          } else {
            return
          }
          syncPush(path)
          void reindexMarkdownPath(vaultFs, path)
        } catch (e) {
          console.error('Save on close failed', e)
          toast.error('Could not save note before closing')
        }
      }

      // Publish the flush promise so the next mount of this same path
      // (e.g. tab closed and immediately reopened) awaits it before
      // reading the file from disk instead of racing it.
      const promise = run()
      pendingMarkdownSaves.set(path, promise)
      void promise.finally(() => {
        if (pendingMarkdownSaves.get(path) === promise) {
          pendingMarkdownSaves.delete(path)
        }
      })
    }
  }, [editor, path, vaultFs, tabId, updateTab, markDirty, syncPush])

  // Auto-focus and select the title for newly created notes
  const clearNew = useEditorStore((s) => s.clearNew)
  useEffect(() => {
    if (!isBootstrapping && isNew) {
      requestAnimationFrame(() => {
        const input = titleInputRef.current
        if (input) {
          input.focus()
          input.select()
        }
      })
      clearNew(tabId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBootstrapping, isNew])

  /** Open (or refocus) the find bar, seeding it from the current selection. */
  function openFind() {
    const ed = editorRef.current
    if (!ed || showRawRef.current) return
    const { from, to } = ed.state.selection
    const sel = from !== to ? ed.state.doc.textBetween(from, to, ' ') : ''
    if (sel.length > 0 && sel.length <= 200 && !sel.includes('\n')) {
      setFindInitialTerm(sel)
    }
    setFindOpen(true)
    setFindFocusPulse((n) => n + 1)
  }

  function closeFind() {
    setFindOpen(false)
    setFindInitialTerm('')
  }

  function handleEditorAreaKeyDown(e: React.KeyboardEvent) {
    if (e.defaultPrevented) return
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F') && !showRawSource) {
      e.preventDefault()
      openFind()
      return
    }
    if (e.key === 'Escape' && findOpen) {
      e.preventDefault()
      editorRef.current?.commands.clearFind()
      closeFind()
    }
  }

  /** 0–1 how far down `el` is scrolled. */
  function scrollFractionOf(el: HTMLElement | null): number {
    if (!el) return 0
    const range = el.scrollHeight - el.clientHeight
    return range > 0 ? el.scrollTop / range : 0
  }

  function handleShowRaw() {
    const ed = editorRef.current
    if (!ed || loadingRef.current) return
    if (findOpen) {
      ed.commands.clearFind()
      closeFind()
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    modeSwitchScrollFractionRef.current = scrollFractionOf(visualScrollRef.current)
    const body = tiptapJSONToMarkdown(ed.getJSON())
    setRawText(serializeNote(frontmatterRef.current, body))
    updateTab(tabId, { showRawSource: true })
    markDirty(tabId, false)
  }

  function handleShowVisual() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    // Capture before the async work — the source editor unmounts when
    // the mode flips.
    const scrollFraction = scrollFractionOf(sourceScrollRef.current)
    void (async () => {
      try {
        const latest = rawTextRef.current
        await vaultFs.writeTextFile(pathRef.current, latest)
        const doc = parseNote(pathRef.current, latest)
        frontmatterRef.current = doc.frontmatter
        setVoiceAttach(voiceAttachmentFromFrontmatter(doc.frontmatter))
        const ed = editorRef.current
        if (ed) {
          ed.commands.setContent(markdownToTiptapJSON(doc.content), false)
          setWordCount(countWords(ed.getText()))
        }
        const title =
          (typeof doc.frontmatter.title === 'string' && doc.frontmatter.title) ||
          pathRef.current.replace(/\.md$/i, '').split('/').pop() ||
          pathRef.current
        updateTab(tabId, { showRawSource: false, title, isDirty: false })
        onPersistedRef.current?.()
        void reindexMarkdownPath(vaultFs, pathRef.current)
        // Restore proportional scroll once the visual editor has rendered
        // (double rAF: mode flip → EditorContent mounts → layout pass).
        if (scrollFraction > 0) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const el = visualScrollRef.current
              if (el) {
                el.scrollTop = scrollFraction * Math.max(0, el.scrollHeight - el.clientHeight)
              }
            })
          })
        }
      } catch (e) {
        console.error(e)
        toast.error('Failed to switch to visual mode')
      }
    })()
  }

  function handleRawChange(next: string) {
    setRawText(next)
    setWordCount(countWords(parseNote(pathRef.current, next).content))
    markDirty(tabId, true)
    scheduleSaveRef.current()
  }

  const commitTitleRename = useCallback(async () => {
    const sanitized = sanitizeTitle(inlineTitleRef.current)
    const currentTitle = titleFromPath(pathRef.current)

    // Always show the sanitized value (strips illegal chars that may have been typed)
    if (sanitized !== inlineTitleRef.current) setInlineTitle(sanitized)

    if (!sanitized || sanitized === currentTitle) {
      setInlineTitle(currentTitle)
      return
    }

    const fileName = sanitized.endsWith('.md') ? sanitized : `${sanitized}.md`
    const parent = parentDir(pathRef.current)
    const newPath = joinPath(parent, fileName)
    if (vaultPathsPointToSameFile(newPath, pathRef.current)) return

    if ((await vaultFs.exists(newPath)) && !vaultPathsPointToSameFile(newPath, pathRef.current)) {
      toast.error('A note with that name already exists')
      setInlineTitle(currentTitle)
      return
    }

    try {
      // Cancel any pending auto-save so we control the final write
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      // Build the updated file content with the new title in the frontmatter
      const updatedFrontmatter: typeof frontmatterRef.current = {
        ...frontmatterRef.current,
        title: sanitized,
      }
      let fileContent: string
      const ed = editorRef.current
      if (showRawRef.current) {
        // In raw mode, re-parse to extract just the body then re-serialize with new fm
        const { content: body } = parseNote(pathRef.current, rawTextRef.current)
        fileContent = serializeNote(updatedFrontmatter, body)
      } else if (ed && !loadingRef.current) {
        const body = tiptapJSONToMarkdown(ed.getJSON())
        fileContent = serializeNote(updatedFrontmatter, body)
      } else {
        fileContent = serializeNote(updatedFrontmatter, '')
      }

      // Write the updated content THEN rename — loading effect will pick up the
      // correct title from frontmatter when it re-runs after the path changes.
      await vaultFs.writeTextFile(pathRef.current, fileContent)
      frontmatterRef.current = updatedFrontmatter

      await vaultFs.rename(pathRef.current, newPath)
      removeSearchDocument(pathRef.current)
      await reindexMarkdownPath(vaultFs, newPath)

      useEditorStore.getState().retargetTabPath(tabIdRef.current, newPath, sanitized)
      const sel = useFileTreeStore.getState().selectedPath
      if (sel === pathRef.current) useFileTreeStore.getState().setSelectedPath(newPath)

      setInlineTitle(sanitized)
      onRenamed?.()
    } catch (e) {
      console.error('Rename failed', e)
      toast.error('Failed to rename note')
      setInlineTitle(currentTitle)
    }
  }, [vaultFs, onRenamed])

  function getTiptapDocForExport(): JSONContent | null {
    if (loadingRef.current) return null
    if (showRawSource) {
      const doc = parseNote(pathRef.current, rawTextRef.current)
      return markdownToTiptapJSON(doc.content)
    }
    const ed = editorRef.current
    if (!ed) return null
    return ed.getJSON()
  }

  function buildMarkdownExportContent(): string | null {
    if (loadingRef.current) return null
    if (showRawSource) return rawTextRef.current
    const ed = editorRef.current
    if (!ed) return null
    const body = tiptapJSONToMarkdown(ed.getJSON())
    return serializeNote(frontmatterRef.current, body)
  }

  function handleExportMarkdown() {
    const content = buildMarkdownExportContent()
    if (content == null) {
      toast.error('Nothing to export yet')
      return
    }
    const baseName = path.split('/').pop() ?? 'note.md'
    downloadTextFile(baseName, content, 'text/markdown;charset=utf-8')
  }

  async function handlePrint() {
    const docJson = getTiptapDocForExport()
    if (!docJson) {
      toast.error('Nothing to print yet')
      return
    }
    const noteTitle = path.replace(/\.md$/i, '').split('/').pop() ?? 'note'
    try {
      const html = await buildExportHtml(docJson, noteTitle, vaultFs)
      printExportHtml(html)
    } catch (e) {
      console.error('Print preparation failed', e)
      toast.error('Could not open print dialog')
    }
  }

  if (!editor) {
    return (
      <div className="text-fg-muted flex h-48 min-w-0 flex-1 items-center justify-center text-sm">
        Loading editor…
      </div>
    )
  }

  return (
    <div
      className="bg-bg flex h-full min-h-0 min-w-0 flex-1 flex-col"
      onKeyDown={handleEditorAreaKeyDown}
    >
      <NoteEditorModeBar
        raw={showRawSource}
        busy={isBootstrapping}
        wordCount={wordCount}
        onFind={showRawSource ? undefined : openFind}
        onExportMarkdown={() => handleExportMarkdown()}
        onPrint={() => void handlePrint()}
        onVisual={() => {
          if (!showRawSource) return
          handleShowVisual()
        }}
        onRaw={() => {
          if (showRawSource) return
          handleShowRaw()
        }}
      />
      {!showRawSource && (
        <NoteEditorToolbar
          editor={editor}
          vaultFs={vaultFs}
          allPaths={allPaths}
          attachmentFolder={attachmentFolder}
          onInsertImage={handleInsertImage}
          onInsertVideo={handleInsertVideo}
        />
      )}
      {!showRawSource && <TableControlsMenu editor={editor} />}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {findOpen && !showRawSource && (
          <FindReplaceBar
            editor={editor}
            initialTerm={findInitialTerm}
            focusPulse={findFocusPulse}
            onClose={closeFind}
            className="absolute top-2 right-6 z-20"
          />
        )}
        <div
          ref={visualScrollRef}
          className={cn('min-h-0 flex-1', showRawSource ? 'flex flex-col' : 'overflow-y-auto')}
        >
          <div className="px-10 pt-6">
            <input
              ref={titleInputRef}
              type="text"
              value={inlineTitle}
              onChange={(e) => {
                // Strip illegal filename characters as the user types
                const cleaned = e.target.value.replace(/[/\\:*?"<>|]/g, '')
                setInlineTitle(cleaned)
              }}
              onBlur={() => void commitTitleRename()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.target as HTMLInputElement).blur()
                }
                if (e.key === 'Escape') {
                  setInlineTitle(titleFromPath(pathRef.current))
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              aria-label="Note title"
              className="text-fg placeholder:text-fg-muted w-full border-none bg-transparent text-[2rem] leading-tight font-bold tracking-tight outline-none"
              placeholder="Untitled"
            />
          </div>
          {voiceAttach && (
            <div className="px-10">
              <NoteVoiceAttachment
                vaultPath={voiceAttach.path}
                durationSec={voiceAttach.duration}
              />
            </div>
          )}
          {showRawSource ? (
            <MarkdownSourceEditor
              initialValue={rawText}
              onChange={handleRawChange}
              className="px-10 pt-2 pb-6"
              initialScrollFraction={modeSwitchScrollFractionRef.current ?? undefined}
              scrollElementRef={sourceScrollRef}
            />
          ) : (
            <EditorContent editor={editor} />
          )}
        </div>
      </div>
    </div>
  )
})
