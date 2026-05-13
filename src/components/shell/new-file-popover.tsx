'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Columns3, FileText, GitBranch, Layout, Mic, StickyNote, Upload } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useNewFileActions } from '@/lib/notes/use-new-file-actions'
import { useUiStore } from '@/stores/ui'
import { ViewMode } from '@/types/vault'
import { cn } from '@/utils/cn'

export function NewFilePopover({
  children,
  onDismiss,
  enableGlobalShortcut = true,
}: {
  children: React.ReactNode
  /** Called whenever the menu closes (including after creating a file). */
  onDismiss?: () => void
  /** When false, Ctrl+N / `ink:open-new-popover` does not open this instance. */
  enableGlobalShortcut?: boolean
}) {
  const [open, setOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const close = () => {
    setOpen(false)
    onDismiss?.()
  }

  const { createNote, createThought, createDrawing, createKanban, createMindmap, importFiles, busy } =
    useNewFileActions(close)

  useEffect(() => {
    if (!enableGlobalShortcut) return
    function handler() { setOpen(true) }
    window.addEventListener('ink:open-new-popover', handler)
    return () => window.removeEventListener('ink:open-new-popover', handler)
  }, [enableGlobalShortcut])

  const ITEMS: {
    label: string
    icon: typeof FileText
    accent: string
    action: () => void
  }[] = [
    {
      label: 'Note',
      icon: FileText,
      accent: 'text-blue-500',
      action: () => void createNote(),
    },
    {
      label: 'Thought',
      icon: StickyNote,
      accent: 'text-yellow-500',
      action: () => void createThought(),
    },
    {
      label: 'Canvas',
      icon: Layout,
      accent: 'text-violet-500',
      action: () => void createDrawing(),
    },
    {
      label: 'Kanban',
      icon: Columns3,
      accent: 'text-amber-500',
      action: () => void createKanban(),
    },
    {
      label: 'Mindmap',
      icon: GitBranch,
      accent: 'text-teal-500',
      action: () => void createMindmap(),
    },
    {
      label: 'Recording',
      icon: Mic,
      accent: 'text-red-500',
      action: () => {
        useUiStore.getState().setActiveView(ViewMode.Board)
        setTimeout(() => window.dispatchEvent(new CustomEvent('ink:board-start-recording')), 100)
        close()
      },
    },
    {
      label: 'Photo',
      icon: Camera,
      accent: 'text-sky-500',
      action: () => photoInputRef.current?.click(),
    },
    {
      label: 'File',
      icon: Upload,
      accent: 'text-emerald-500',
      action: () => fileInputRef.current?.click(),
    },
  ]

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        aria-label="Choose files to import"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void importFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Capture photo"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void importFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="right"
            align="end"
            sideOffset={8}
            className="border-border bg-bg z-50 min-w-[180px] rounded-xl border p-1.5 shadow-lg outline-none"
          >
            {ITEMS.map(({ label, icon: Icon, accent, action }) => (
              <DropdownMenu.Item
                key={label}
                disabled={busy}
                onSelect={action}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors select-none',
                  'text-fg hover:bg-bg-hover focus:bg-bg-hover',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                )}
              >
                <Icon className={cn('size-4 shrink-0', accent)} aria-hidden />
                {label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  )
}
