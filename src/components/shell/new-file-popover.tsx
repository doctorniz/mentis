'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Columns3, FileText, Layout, Mic, Table2, Upload, X } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { useNewFileActions } from '@/lib/notes/use-new-file-actions'
import { useUiStore } from '@/stores/ui'
import { ViewMode } from '@/types/vault'
import { cn } from '@/utils/cn'

type MenuType = 'note' | 'file' | 'drawing' | 'kanban' | 'spreadsheet' | 'recording'

export function NewFilePopover({
  children,
  onDismiss,
  enableGlobalShortcut = true,
}: {
  children: React.ReactNode
  /** Called whenever the popover closes (including after creating a file). */
  onDismiss?: () => void
  /** When false, Ctrl+N / `ink:open-new-popover` does not open this instance (e.g. hidden desktop trigger on mobile). */
  enableGlobalShortcut?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [showFileUpload, setShowFileUpload] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setShowFileUpload(false)
  }, [])

  const { createNote, createDrawing, createPdf, createKanban, createSpreadsheet, importFiles, busy } = useNewFileActions(close)

  useEffect(() => {
    if (!enableGlobalShortcut) return
    function handler() {
      setOpen(true)
    }
    window.addEventListener('ink:open-new-popover', handler)
    return () => window.removeEventListener('ink:open-new-popover', handler)
  }, [enableGlobalShortcut])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setShowFileUpload(false)
      onDismiss?.()
    }
  }

  const TYPE_ITEMS: {
    type: MenuType
    label: string
    icon: typeof FileText
    accent: string
    action: () => void
  }[] = [
    { type: 'note', label: 'Note', icon: FileText, accent: 'text-blue-500', action: () => void createNote() },
    { type: 'kanban', label: 'Kanban', icon: Columns3, accent: 'text-amber-500', action: () => void createKanban() },
    { type: 'spreadsheet', label: 'Spreadsheet', icon: Table2, accent: 'text-green-500', action: () => void createSpreadsheet() },
    { type: 'recording', label: 'Recording', icon: Mic, accent: 'text-red-500', action: () => {
      // Switch to Board view and fire event to start recording
      useUiStore.getState().setActiveView(ViewMode.Board)
      // Small delay so the Board view mounts and can listen for the event
      setTimeout(() => window.dispatchEvent(new CustomEvent('ink:board-start-recording')), 100)
      close()
    } },
    { type: 'file', label: 'File', icon: Upload, accent: 'text-emerald-500', action: () => setShowFileUpload(true) },
    { type: 'drawing', label: 'Drawing', icon: Layout, accent: 'text-violet-500', action: () => void createDrawing() },
  ]

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={8}
          className="border-border bg-bg z-50 w-64 rounded-xl border p-0 shadow-lg outline-none"
        >
          <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-fg text-sm font-semibold">
              {showFileUpload ? 'Add file' : 'New file'}
            </span>
            <Popover.Close asChild>
              <button
                type="button"
                className="text-fg-muted hover:text-fg rounded p-0.5 transition-colors"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </Popover.Close>
          </div>

          <div className="p-3">
            {showFileUpload ? (
              <div className="flex flex-col gap-3">
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    void importFiles(e.dataTransfer.files)
                  }}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors',
                    dragOver
                      ? 'border-accent bg-accent/5'
                      : 'border-border-strong',
                  )}
                >
                  <Upload className="text-fg-muted size-6" aria-hidden />
                  <p className="text-fg-muted text-xs">
                    {busy ? 'Importing…' : 'Drag files here'}
                  </p>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    aria-label="Choose files to import"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) void importFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                    className="border-border bg-bg-secondary hover:bg-bg-hover rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Browse
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="bg-border h-px flex-1" />
                  <span className="text-fg-muted text-[10px] font-medium uppercase tracking-wider">or</span>
                  <div className="bg-border h-px flex-1" />
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createPdf()}
                  className="border-border bg-bg-secondary hover:bg-bg-hover rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Create blank PDF
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {TYPE_ITEMS.map(({ type, label, icon: Icon, accent, action }) => (
                  <button
                    key={type}
                    type="button"
                    disabled={busy}
                    onClick={action}
                    className="border-border bg-bg-secondary hover:bg-bg-hover flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50"
                  >
                    <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg bg-bg', accent)}>
                      <Icon className="size-4" />
                    </div>
                    <p className="text-fg text-sm font-medium">{label}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Popover.Arrow className="fill-border" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
