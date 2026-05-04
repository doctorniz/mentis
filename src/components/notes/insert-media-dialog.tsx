'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { Film, ImageIcon, Loader2, UploadCloud, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { isImagePath, isVideoPath, saveAsset } from '@/lib/notes/assets'
import { toast } from '@/stores/toast'

type MediaMode = 'image' | 'video'

interface InsertMediaDialogProps {
  open: boolean
  mode: MediaMode
  attachmentFolder?: string
  onInsert: (vaultPath: string, fileName: string) => void
  onClose: () => void
}

const ACCEPT: Record<MediaMode, string> = {
  image: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp',
  video: 'video/mp4,video/webm,video/ogg,video/quicktime,.mov,.mkv,.avi',
}

function isMediaPath(path: string, mode: MediaMode): boolean {
  return mode === 'image' ? isImagePath(path) : isVideoPath(path)
}

/* ------------------------------------------------------------------ */
/* Vault file browser (reads from vault FS)                             */
/* ------------------------------------------------------------------ */

function VaultFilePicker({
  mode,
  onSelect,
}: {
  mode: MediaMode
  onSelect: (path: string) => void
}) {
  const { vaultFs } = useVaultSession()
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const result: string[] = []
      async function walk(dir: string) {
        try {
          const entries = await vaultFs.readdir(dir)
          for (const e of entries) {
            if (e.isDirectory) {
              // Skip hidden internal dirs
              if (e.name.startsWith('_marrow')) continue
              const sub = dir === '/' ? `/${e.name}` : `${dir}/${e.name}`
              await walk(sub)
            } else {
              const filePath = dir === '/' ? `/${e.name}` : `${dir}/${e.name}`
              const bare = filePath.replace(/^\//, '')
              if (isMediaPath(bare, mode)) {
                result.push(bare)
              }
            }
          }
        } catch { /* ignore unreadable dirs */ }
      }
      await walk('/')
      if (!cancelled) {
        setFiles(result.sort())
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [vaultFs, mode])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <Loader2 className="text-fg-muted size-5 animate-spin" />
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="text-fg-muted flex flex-1 flex-col items-center justify-center gap-2 py-8 text-sm">
        {mode === 'image' ? (
          <ImageIcon className="size-8 opacity-40" />
        ) : (
          <Film className="size-8 opacity-40" />
        )}
        <p>No {mode === 'image' ? 'images' : 'videos'} found in vault</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
      {files.map((path) => (
        <button
          key={path}
          type="button"
          onClick={() => onSelect(path)}
          className="hover:bg-bg-hover text-fg flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
        >
          {mode === 'image' ? (
            <ImageIcon className="text-fg-muted size-3.5 shrink-0" />
          ) : (
            <Film className="text-fg-muted size-3.5 shrink-0" />
          )}
          <span className="min-w-0 truncate font-mono text-xs">{path}</span>
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Upload tab                                                           */
/* ------------------------------------------------------------------ */

function UploadTab({
  mode,
  attachmentFolder,
  onInserted,
}: {
  mode: MediaMode
  attachmentFolder: string
  onInserted: (path: string, name: string) => void
}) {
  const { vaultFs } = useVaultSession()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setUploading(true)
      try {
        for (const file of Array.from(files)) {
          const data = new Uint8Array(await file.arrayBuffer())
          const path = await saveAsset(vaultFs, file.name, data, attachmentFolder)
          onInserted(path, file.name)
        }
      } catch (e) {
        console.error('Upload failed', e)
        toast.error('Failed to upload file')
      } finally {
        setUploading(false)
      }
    },
    [vaultFs, attachmentFolder, onInserted],
  )

  return (
    <div className="flex flex-1 flex-col gap-4 pt-2">
      <div
        role="button"
        tabIndex={0}
        aria-label={`Drop ${mode} here or click to browse`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          'border-border flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 transition-colors',
          dragOver ? 'border-accent bg-accent/5' : 'hover:border-accent/50 hover:bg-bg-hover',
        )}
      >
        {uploading ? (
          <Loader2 className="text-fg-muted size-8 animate-spin" />
        ) : (
          <UploadCloud className="text-fg-muted size-8" />
        )}
        <p className="text-fg-secondary text-sm">
          {uploading
            ? 'Uploading…'
            : `Drop ${mode === 'image' ? 'an image' : 'a video'} here or click to browse`}
        </p>
        <p className="text-fg-muted text-xs">
          Saved to{' '}
          <code className="bg-bg-tertiary rounded px-1 font-mono">
            {attachmentFolder || '_assets'}
          </code>
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[mode]}
        multiple
        className="sr-only"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dialog root                                                          */
/* ------------------------------------------------------------------ */

export function InsertMediaDialog({
  open,
  mode,
  attachmentFolder = '_assets',
  onInsert,
  onClose,
}: InsertMediaDialogProps) {
  const title = mode === 'image' ? 'Insert image' : 'Insert video'

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[299] bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Content
          className="border-border bg-bg fixed top-1/2 left-1/2 z-[300] flex w-[min(100vw-2rem,480px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border shadow-xl outline-none"
          style={{ maxHeight: 'min(90vh, 540px)' }}
        >
          {/* Header */}
          <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
            <Dialog.Title className="text-fg text-sm font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="text-fg-muted hover:text-fg rounded p-0.5 transition-colors"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Tabs */}
          <Tabs.Root defaultValue="upload" className="flex min-h-0 flex-1 flex-col">
            <Tabs.List className="border-border flex shrink-0 border-b px-4">
              {(['upload', 'vault'] as const).map((tab) => (
                <Tabs.Trigger
                  key={tab}
                  value={tab}
                  className={cn(
                    'border-b-2 px-3 py-2.5 text-xs font-medium capitalize transition-colors',
                    'data-[state=active]:border-accent data-[state=active]:text-accent',
                    'data-[state=inactive]:border-transparent data-[state=inactive]:text-fg-secondary data-[state=inactive]:hover:text-fg',
                  )}
                >
                  {tab === 'upload' ? 'Upload' : 'From vault'}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
              <Tabs.Content value="upload" className="flex min-h-0 flex-1 flex-col">
                <UploadTab
                  mode={mode}
                  attachmentFolder={attachmentFolder}
                  onInserted={(path, name) => { onInsert(path, name); onClose() }}
                />
              </Tabs.Content>
              <Tabs.Content value="vault" className="flex min-h-0 flex-1 flex-col">
                <VaultFilePicker
                  mode={mode}
                  onSelect={(path) => {
                    const name = path.split('/').pop() ?? path
                    onInsert(path, name)
                    onClose()
                  }}
                />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
