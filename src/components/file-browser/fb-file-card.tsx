'use client'

import { forwardRef, useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react'
import { File, FileText, FileType as FileTypeIcon, ImageIcon, LayoutGrid, Table2 } from 'lucide-react'
import type { FbFileItem } from '@/types/file-browser'
import type { FileSystemAdapter } from '@/lib/fs'
import { getImageThumbnail } from '@/lib/file-browser/image-thumbnail'
import { getPdfThumbnail } from '@/lib/pdf/thumbnail'
import { cn } from '@/utils/cn'

export const FB_DND_TYPE = 'application/x-ink-fb-path'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** macOS-style folder shape in SVG */
function FolderSvg({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* back panel */}
      <path
        d="M4 10C4 7.79086 5.79086 6 8 6H22L26 10H48C50.2091 10 52 11.7909 52 14V38C52 40.2091 50.2091 42 48 42H8C5.79086 42 4 40.2091 4 38V10Z"
        fill="currentColor"
        opacity="0.35"
      />
      {/* main body */}
      <path
        d="M4 16C4 13.7909 5.79086 12 8 12H48C50.2091 12 52 13.7909 52 16V38C52 40.2091 50.2091 42 48 42H8C5.79086 42 4 40.2091 4 38V16Z"
        fill="currentColor"
      />
    </svg>
  )
}

function GridIcon({ className }: { className?: string }) {
  return <LayoutGrid className={className} aria-hidden />
}

function FileCardIcon({ item, thumbUrl }: { item: FbFileItem; thumbUrl: string | null }) {
  if (item.isDirectory) {
    return (
      <div className="text-amber-400 dark:text-amber-300 flex h-14 w-14 items-center justify-center">
        <FolderSvg className="h-full w-full drop-shadow-sm" />
      </div>
    )
  }

  if (item.type === 'pdf' && thumbUrl) {
    return (
      <div className="flex h-14 w-[42px] items-center justify-center overflow-hidden rounded shadow-sm ring-1 ring-black/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
      </div>
    )
  }

  if (item.type === 'image' && thumbUrl) {
    return (
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg shadow-sm ring-1 ring-black/10 dark:ring-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
      </div>
    )
  }

  switch (item.type) {
    case 'pdf':
      return (
        <div className="bg-red-50 dark:bg-red-950/40 flex h-14 w-14 items-center justify-center rounded-xl">
          <FileTypeIcon className="text-red-500 size-8" />
        </div>
      )
    case 'markdown':
      return (
        <div className="bg-blue-50 dark:bg-blue-950/40 flex h-14 w-14 items-center justify-center rounded-xl">
          <FileText className="text-blue-500 size-8" />
        </div>
      )
    case 'canvas':
      return (
        <div className="bg-violet-50 dark:bg-violet-950/40 flex h-14 w-14 items-center justify-center rounded-xl">
          <GridIcon className="text-violet-500 size-8" />
        </div>
      )
    case 'image':
      return (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 flex h-14 w-14 items-center justify-center rounded-xl">
          <ImageIcon className="text-emerald-500 size-8" />
        </div>
      )
    case 'spreadsheet':
      return (
        <div className="bg-green-50 dark:bg-green-950/40 flex h-14 w-14 items-center justify-center rounded-xl">
          <Table2 className="text-green-500 size-8" />
        </div>
      )
    default:
      return (
        <div className="bg-bg-secondary flex h-14 w-14 items-center justify-center rounded-xl">
          <File className="text-fg-muted size-8" />
        </div>
      )
  }
}

/* ------------------------------------------------------------------ */
/* Grid card (icon view)                                               */
/* ------------------------------------------------------------------ */

type FbFileCardOwnProps = {
  item: FbFileItem
  vaultFs: FileSystemAdapter
  isSelected: boolean
  isEditing?: boolean
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onStartEdit?: () => void
  onCommitEdit?: (newName: string) => void
  onCancelEdit?: () => void
  onDropFile?: (srcPath: string, destFolder: string) => void
  onDropExternalFiles?: (files: FileList, destFolder: string) => void
}

export type FbFileCardProps = FbFileCardOwnProps &
  Omit<
    ComponentPropsWithoutRef<'div'>,
    keyof FbFileCardOwnProps | 'children' | 'dangerouslySetInnerHTML'
  >

export const FbFileCard = forwardRef<HTMLDivElement, FbFileCardProps>(function FbFileCard({
  item,
  vaultFs,
  isSelected,
  isEditing,
  onClick,
  onDoubleClick,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDropFile,
  onDropExternalFiles,
  className,
  onKeyDown,
  ...rest
}, ref) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const renameTimerRef = useRef<number>(0)

  /** Keep within virtualized grid row (`CARD_HEIGHT` in file-browser-view). */
  const RENAME_TEXTAREA_MAX_PX = 72

  function resizeRenameTextarea(el: HTMLTextAreaElement) {
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, RENAME_TEXTAREA_MAX_PX)}px`
  }

  useEffect(() => {
    if (!isEditing) return
    const id = requestAnimationFrame(() => {
      const el = editRef.current
      if (el) resizeRenameTextarea(el)
    })
    return () => cancelAnimationFrame(id)
  }, [isEditing])

  useEffect(() => {
    if (item.isDirectory) return
    if (item.type !== 'pdf' && item.type !== 'image') return
    let cancel = false
    const loader = item.type === 'pdf' ? getPdfThumbnail : getImageThumbnail
    void loader(vaultFs, item.path).then((url) => {
      if (!cancel) setThumbUrl(url)
    })
    return () => { cancel = true }
  }, [item.path, item.type, item.isDirectory, vaultFs])

  useEffect(() => () => clearTimeout(renameTimerRef.current), [])

  function commitEdit() {
    const raw = editRef.current?.value ?? ''
    const val = raw.replace(/\r?\n/g, '').trim()
    if (val && onCommitEdit) onCommitEdit(val)
    onCancelEdit?.()
  }

  return (
    <div
      ref={ref}
      {...rest}
      data-fb-item
      data-fb-path={item.path}
      draggable={!item.isDirectory && !isEditing}
      onDragStart={(e) => {
        e.dataTransfer.setData(FB_DND_TYPE, item.path)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={item.isDirectory ? (e) => {
        if (e.dataTransfer.types.includes(FB_DND_TYPE) || e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
          setDragOver(true)
        }
      } : undefined}
      onDragLeave={item.isDirectory ? (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      } : undefined}
      onDrop={item.isDirectory ? (e) => {
        setDragOver(false)
        if (e.dataTransfer.files.length > 0 && !e.dataTransfer.types.includes(FB_DND_TYPE)) {
          e.preventDefault()
          e.stopPropagation()
          onDropExternalFiles?.(e.dataTransfer.files, item.path)
          return
        }
        const src = e.dataTransfer.getData(FB_DND_TYPE)
        if (!src) return
        e.preventDefault()
        e.stopPropagation()
        onDropFile?.(src, item.path)
      } : undefined}
      onClick={onClick}
      onDoubleClick={isEditing ? undefined : () => {
        clearTimeout(renameTimerRef.current)
        onDoubleClick()
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (e.key === 'Enter' && !isEditing) onDoubleClick()
        if (e.key === 'F2' && !isEditing) { e.preventDefault(); onStartEdit?.() }
      }}
      tabIndex={0}
      role="option"
      aria-selected={isSelected}
      className={cn(
        'group flex select-none flex-col items-center gap-1.5 rounded-xl p-2 outline-none transition-colors duration-75 focus-visible:ring-1',
        isSelected
          ? 'bg-accent/20 ring-accent/40 ring-1 focus-visible:ring-accent'
          : dragOver
            ? 'bg-accent/10 ring-accent/30 ring-1'
            : 'hover:bg-bg-hover focus-visible:ring-accent/40',
        className,
      )}
    >
      <FileCardIcon item={item} thumbUrl={thumbUrl} />

      <div className="relative w-full min-w-0 px-0.5 text-center">
        {isEditing ? (
          <textarea
            ref={editRef}
            rows={1}
            data-fb-rename=""
            defaultValue={item.name}
            spellCheck={false}
            autoFocus
            onFocus={(e) => {
              const v = e.currentTarget.value
              const dot = v.lastIndexOf('.')
              e.currentTarget.setSelectionRange(0, dot > 0 ? dot : v.length)
            }}
            onBlur={commitEdit}
            onInput={(e) => resizeRenameTextarea(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitEdit()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                onCancelEdit?.()
              }
              e.stopPropagation()
            }}
            className="text-fg bg-bg border-accent box-border w-full min-w-0 max-w-full resize-none overflow-y-auto rounded border px-1 py-0.5 text-left text-[11px] font-medium leading-tight break-all outline-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="text-fg line-clamp-2 cursor-default text-[11px] font-medium leading-tight"
            title={item.name}
            onClick={(e) => {
              if (isSelected) {
                e.stopPropagation()
                clearTimeout(renameTimerRef.current)
                renameTimerRef.current = window.setTimeout(() => onStartEdit?.(), 400)
              }
            }}
          >
            {item.name}
          </span>
        )}
      </div>
    </div>
  )
})

/* ------------------------------------------------------------------ */
/* List row                                                            */
/* ------------------------------------------------------------------ */

function FileRowIcon({ item, thumbUrl }: { item: FbFileItem; thumbUrl: string | null }) {
  if (item.isDirectory) {
    return <FolderSvg className="text-amber-400 dark:text-amber-300 h-4 w-5 shrink-0" />
  }
  if (item.type === 'image' && thumbUrl) {
    return (
      <div className="size-5 shrink-0 overflow-hidden rounded ring-1 ring-black/10 dark:ring-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
      </div>
    )
  }
  switch (item.type) {
    case 'pdf':
      return <FileTypeIcon className="text-red-500 size-4 shrink-0" />
    case 'markdown':
      return <FileText className="text-blue-500 size-4 shrink-0" />
    case 'canvas':
      return <GridIcon className="text-violet-500 size-4 shrink-0" />
    case 'image':
      return <ImageIcon className="text-emerald-500 size-4 shrink-0" />
    default:
      return <File className="text-fg-muted size-4 shrink-0" />
  }
}

type FbFileRowOwnProps = {
  item: FbFileItem
  vaultFs: FileSystemAdapter
  isSelected: boolean
  isEditing?: boolean
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onStartEdit?: () => void
  onCommitEdit?: (newName: string) => void
  onCancelEdit?: () => void
  onDropFile?: (srcPath: string, destFolder: string) => void
  onDropExternalFiles?: (files: FileList, destFolder: string) => void
}

export type FbFileRowProps = FbFileRowOwnProps &
  Omit<
    ComponentPropsWithoutRef<'div'>,
    keyof FbFileRowOwnProps | 'children' | 'dangerouslySetInnerHTML'
  >

export const FbFileRow = forwardRef<HTMLDivElement, FbFileRowProps>(function FbFileRow({
  item,
  vaultFs,
  isSelected,
  isEditing,
  onClick,
  onDoubleClick,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDropFile,
  onDropExternalFiles,
  className,
  onKeyDown,
  ...rest
}, ref) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const editRef = useRef<HTMLInputElement>(null)
  const renameTimerRef = useRef<number>(0)

  useEffect(() => {
    if (item.type !== 'image' || item.isDirectory) return
    let cancel = false
    void getImageThumbnail(vaultFs, item.path).then((url) => {
      if (!cancel) setThumbUrl(url)
    })
    return () => { cancel = true }
  }, [item.path, item.type, item.isDirectory, vaultFs])

  useEffect(() => () => clearTimeout(renameTimerRef.current), [])

  function commitEdit() {
    const val = editRef.current?.value.trim()
    if (val && onCommitEdit) onCommitEdit(val)
    onCancelEdit?.()
  }

  return (
    <div
      ref={ref}
      {...rest}
      data-fb-item
      data-fb-path={item.path}
      draggable={!item.isDirectory && !isEditing}
      onDragStart={(e) => {
        e.dataTransfer.setData(FB_DND_TYPE, item.path)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={item.isDirectory ? (e) => {
        if (e.dataTransfer.types.includes(FB_DND_TYPE) || e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
          setDragOver(true)
        }
      } : undefined}
      onDragLeave={item.isDirectory ? (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      } : undefined}
      onDrop={item.isDirectory ? (e) => {
        setDragOver(false)
        if (e.dataTransfer.files.length > 0 && !e.dataTransfer.types.includes(FB_DND_TYPE)) {
          e.preventDefault()
          e.stopPropagation()
          onDropExternalFiles?.(e.dataTransfer.files, item.path)
          return
        }
        const src = e.dataTransfer.getData(FB_DND_TYPE)
        if (!src) return
        e.preventDefault()
        e.stopPropagation()
        onDropFile?.(src, item.path)
      } : undefined}
      onClick={onClick}
      onDoubleClick={isEditing ? undefined : () => {
        clearTimeout(renameTimerRef.current)
        onDoubleClick()
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (e.key === 'Enter' && !isEditing) onDoubleClick()
        if (e.key === 'F2' && !isEditing) { e.preventDefault(); onStartEdit?.() }
      }}
      tabIndex={0}
      role="option"
      aria-selected={isSelected}
      className={cn(
        'group flex select-none items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors duration-75 focus-visible:ring-1',
        isSelected
          ? 'bg-accent/20 ring-accent/40 ring-1 focus-visible:ring-accent'
          : dragOver
            ? 'bg-accent/10 ring-accent/30 ring-1'
            : 'hover:bg-bg-hover focus-visible:ring-accent/40',
        className,
      )}
    >
      <FileRowIcon item={item} thumbUrl={thumbUrl} />
      {isEditing ? (
        <input
          ref={editRef}
          type="text"
          data-fb-rename=""
          defaultValue={item.name}
          autoFocus
          onFocus={(e) => {
            const dot = e.currentTarget.value.lastIndexOf('.')
            e.currentTarget.setSelectionRange(0, dot > 0 ? dot : e.currentTarget.value.length)
          }}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
            if (e.key === 'Escape') { e.preventDefault(); onCancelEdit?.() }
            e.stopPropagation()
          }}
          className="text-fg bg-bg border-accent min-w-0 flex-1 rounded border px-1 py-0 text-sm font-medium outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="text-fg min-w-0 flex-1 cursor-default truncate font-medium"
          onClick={(e) => {
            if (isSelected) {
              e.stopPropagation()
              clearTimeout(renameTimerRef.current)
              renameTimerRef.current = window.setTimeout(() => onStartEdit?.(), 400)
            }
          }}
        >
          {item.name}
        </span>
      )}
      <span className="text-fg-muted w-16 shrink-0 text-right text-xs">
        {item.isDirectory ? '—' : formatSize(item.size)}
      </span>
      <span className="text-fg-muted w-24 shrink-0 text-right text-xs">
        {item.modifiedAt
          ? new Date(item.modifiedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: '2-digit',
            })
          : '—'}
      </span>
    </div>
  )
})
