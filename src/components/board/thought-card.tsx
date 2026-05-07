'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Loader2, Mic, Sparkles, Trash2 } from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import { marked } from 'marked'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { stripBoardImageMarkdown } from '@/lib/board'
import { getBoardEditorExtensions, boardMarkdownToJSON, boardJSONToMarkdown } from '@/lib/editor/board-extensions'
import { assetToBlobUrl } from '@/lib/notes/assets'
import { AudioPlayer } from '@/components/audio/audio-player'
import { useBoardStore } from '@/stores/board'
import type { BoardItem, ThoughtColor } from '@/types/board'
import { cn } from '@/utils/cn'
import { useUiStore } from '@/stores/ui'
import { useEditorStore } from '@/stores/editor'
import { ViewMode } from '@/types/vault'
import { toast } from '@/stores/toast'

const COLOR_CLASSES: Record<ThoughtColor, { bg: string; border: string }> = {
  yellow: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200/60 dark:border-amber-800/40' },
  blue:   { bg: 'bg-sky-50 dark:bg-sky-950/30', border: 'border-sky-200/60 dark:border-sky-800/40' },
  pink:   { bg: 'bg-pink-50 dark:bg-pink-950/30', border: 'border-pink-200/60 dark:border-pink-800/40' },
  green:  { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200/60 dark:border-emerald-800/40' },
  purple: { bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200/60 dark:border-violet-800/40' },
  white:  { bg: 'bg-white dark:bg-zinc-900/60', border: 'border-zinc-200/60 dark:border-zinc-700/40' },
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Strip image references from a body before rendering — ImagePreview handles them separately. */
function bodyWithoutImages(body: string): string {
  return body.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

function ReadContent({ body }: { body: string }) {
  const displayBody = useMemo(() => bodyWithoutImages(body), [body])
  const html = useMemo(() => {
    try {
      return marked.parse(displayBody, { async: false, gfm: true, breaks: true }) as string
    } catch {
      return displayBody
    }
  }, [displayBody])

  if (!displayBody) return null

  return (
    <div
      className="board-card-prose text-fg text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function EditContent({
  item,
  onDone,
}: {
  item: BoardItem
  onDone: () => void
}) {
  const { vaultFs } = useVaultSession()
  const updateItem = useBoardStore((s) => s.updateItem)
  const extensions = useMemo(() => getBoardEditorExtensions(), [])
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  // Strip image references before loading — board extensions have no Image node so generateJSON
  // would silently drop them, permanently deleting the image reference from the file.
  const { stripped, imageLines } = useMemo(() => stripBoardImageMarkdown(item.body), [item.body])
  const initialContent = useMemo(() => boardMarkdownToJSON(stripped), [stripped])

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialContent,
    editorProps: {
      attributes: { class: 'ProseMirror board-editor outline-none text-sm leading-relaxed' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          doneRef.current()
          return true
        }
        return false
      },
    },
  })

  useEffect(() => {
    if (editor) setTimeout(() => editor.commands.focus('end'), 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = useCallback(() => {
    if (!editor || editor.isDestroyed) return
    const markdown = boardJSONToMarkdown(editor.getJSON())

    // Sync image alt text with the new H1 title so the label stays consistent
    const h1 = /^#\s+(.+)$/m.exec(markdown)
    const newTitle = h1 ? h1[1].trim() : null
    const updatedImageLines = imageLines.map((line) =>
      newTitle ? line.replace(/!\[[^\]]*\](\([^)]+\))/, `![${newTitle}]$1`) : line,
    )

    const parts = [markdown, ...updatedImageLines].filter(Boolean)
    void updateItem(vaultFs, item.path, parts.length ? `\n${parts.join('\n\n')}\n` : '\n')
  }, [editor, vaultFs, item.path, updateItem, imageLines])

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      save()
      doneRef.current()
    }
  }, [save])

  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    return () => { saveRef.current() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div onBlur={handleBlur}>
      <EditorContent editor={editor} />
    </div>
  )
}

/** Image card with a blob URL loaded from the vault FS. */
function ImagePreview({ vaultPath, alt }: { vaultPath: string; alt: string }) {
  const { vaultFs } = useVaultSession()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    assetToBlobUrl(vaultFs, vaultPath)
      .then((u) => { url = u; setBlobUrl(u) })
      .catch(() => {/* ignore missing file */})
    return () => { if (url) URL.revokeObjectURL(url) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath])

  if (!blobUrl) return null

  return (
    <div className="-mx-4 -mt-4 mb-3 overflow-hidden rounded-t-xl">
      <img src={blobUrl} alt={alt} className="h-auto w-full object-cover" loading="lazy" />
    </div>
  )
}

/** Extract the first `![alt](path)` from a markdown body — vault-relative paths only. */
function parseImageFromBody(body: string): { alt: string; vaultPath: string } | null {
  const match = /!\[([^\]]*)\]\(([^)]+)\)/.exec(body)
  if (!match) return null
  const [, alt, src] = match
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) return null
  return { alt, vaultPath: src }
}

/** Audio player for board audio thoughts. */
function AudioPreview({ audioPath, duration }: { audioPath: string; duration: number | null }) {
  const { vaultFs } = useVaultSession()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    assetToBlobUrl(vaultFs, audioPath)
      .then((u) => { url = u; setBlobUrl(u) })
      .catch(() => {/* ignore missing file */})
    return () => { if (url) URL.revokeObjectURL(url) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioPath])

  if (!blobUrl) return null

  return (
    <div className="mb-1" onClick={(e) => e.stopPropagation()}>
      <AudioPlayer src={blobUrl} duration={duration ?? undefined} compact />
    </div>
  )
}


function TranscribeButton({ item }: { item: BoardItem }) {
  const { vaultFs } = useVaultSession()
  const updateItemMeta = useBoardStore((s) => s.updateItemMeta)
  const [transcribing, setTranscribing] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { status: string; progress?: number }
      if (detail.status === 'progress' && detail.progress != null) {
        setProgress(`${Math.round(detail.progress)}%`)
      } else if (detail.status === 'ready') {
        setProgress(null)
      }
    }
    window.addEventListener('ink:whisper-progress', handler)
    return () => window.removeEventListener('ink:whisper-progress', handler)
  }, [])

  const handleTranscribe = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item.audioPath || transcribing) return
    setTranscribing(true)
    try {
      const audioBytes = await vaultFs.readFile(item.audioPath)
      const { transcribeAudio } = await import('@/lib/audio/transcribe')
      const { text } = await transcribeAudio(audioBytes)
      if (text) {
        await updateItemMeta(vaultFs, item.path, { transcript: text })
      }
    } catch (err) {
      console.error('Transcription failed:', err)
    } finally {
      setTranscribing(false)
      setProgress(null)
    }
  }, [vaultFs, item.audioPath, item.path, transcribing, updateItemMeta])

  return (
    <button
      type="button"
      onClick={handleTranscribe}
      disabled={transcribing}
      className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-60"
    >
      {transcribing ? (
        <>
          <Loader2 className="size-3 animate-spin" />
          {progress ? `Downloading model… ${progress}` : 'Transcribing…'}
        </>
      ) : (
        <>
          <Sparkles className="size-3" />
          Transcribe
        </>
      )}
    </button>
  )
}

export function ThoughtCard({ item }: { item: BoardItem }) {
  const { vaultFs } = useVaultSession()
  const activeItemPath = useBoardStore((s) => s.activeItemPath)
  const setActiveItem = useBoardStore((s) => s.setActiveItem)
  const removeItem = useBoardStore((s) => s.removeItem)
  const moveToVault = useBoardStore((s) => s.moveToVault)
  const isEditing = activeItemPath === item.path
  const [hovered, setHovered] = useState(false)
  const colors = COLOR_CLASSES[item.color] ?? COLOR_CLASSES.yellow

  const imageInfo = useMemo(() => parseImageFromBody(item.body), [item.body])

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      void removeItem(vaultFs, item.path)
    },
    [vaultFs, item.path, removeItem],
  )

  const handleMoveToVault = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      void (async () => {
        const newPath = await moveToVault(vaultFs, item.path)
        if (newPath) {
          useEditorStore.getState().setPendingVaultOpenPath(newPath)
          useUiStore.getState().setVaultMode('tree')
          useUiStore.getState().setActiveView(ViewMode.Vault)
        } else {
          toast.error('Could not move to vault')
        }
      })()
    },
    [vaultFs, item.path, moveToVault],
  )

  const isEmpty = !item.body.trim() && !item.title

  return (
    <div
      className={cn(
        'group relative break-inside-avoid mb-3 overflow-hidden rounded-xl border transition-all duration-200',
        colors.bg,
        colors.border,
        isEditing
          ? 'shadow-md ring-1 ring-accent/30'
          : 'shadow-sm hover:shadow-md hover:-translate-y-0.5',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => { if (!isEditing) setActiveItem(item.path) }}
    >
      {/* Image always visible — even in edit mode — so it cannot be lost */}
      {imageInfo && (
        <ImagePreview vaultPath={imageInfo.vaultPath} alt={imageInfo.alt} />
      )}

      <div className="p-4">
        {/* Audio player for audio thoughts */}
        {item.type === 'audio' && item.audioPath && (
          <div className="mb-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Mic className="size-3 text-fg-muted" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-fg-muted">Voice Note</span>
            </div>
            <AudioPreview audioPath={item.audioPath} duration={item.audioDuration} />
          </div>
        )}

        {/* Transcript for audio thoughts */}
        {item.type === 'audio' && item.transcript && (
          <div className="mb-2 rounded-lg bg-fg/[0.03] px-2.5 py-2">
            <p className="text-xs leading-relaxed text-fg-secondary">{item.transcript}</p>
          </div>
        )}

        {/* Transcribe button for audio thoughts without transcript */}
        {item.type === 'audio' && item.audioPath && !item.transcript && (
          <TranscribeButton item={item} />
        )}

        {isEditing ? (
          <EditContent item={item} onDone={() => setActiveItem(null)} />
        ) : (
          <div className={cn('cursor-pointer', isEmpty && !item.audioPath && 'min-h-[3rem]')}>
            <ReadContent body={item.body} />
            {isEmpty && !item.audioPath && (
              <p className="text-fg-muted/40 text-sm italic">Empty thought</p>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-fg-muted/50 select-none">
            {formatRelativeDate(item.modified)}
          </span>
          {(hovered || isEditing) && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleMoveToVault}
                className="rounded-md p-1 text-fg-muted/40 transition-colors hover:text-accent hover:bg-accent/10"
                aria-label="Move to Vault"
                title="Move to Vault"
              >
                <ArrowUpRight className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md p-1 text-fg-muted/40 transition-colors hover:text-destructive hover:bg-destructive/10"
                aria-label="Delete thought"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
