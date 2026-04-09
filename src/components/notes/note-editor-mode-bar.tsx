'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, FileCode, FileDown, FileText, PenLine, Printer } from 'lucide-react'
import { cn } from '@/utils/cn'

export function NoteEditorModeBar({
  raw,
  onVisual,
  onRaw,
  onExportMarkdown,
  onPrint,
  busy,
}: {
  raw: boolean
  onVisual: () => void
  onRaw: () => void
  onExportMarkdown?: () => void
  /** Opens browser print dialog with print-styled HTML (save as PDF from the dialog). */
  onPrint?: () => void
  /** Disable switching while file is loading into the editor. */
  busy?: boolean
}) {
  const exportOpen = Boolean(onExportMarkdown || onPrint)
  return (
    <div
      className="border-border flex items-center gap-1.5 border-b px-2 py-1"
      role="tablist"
      aria-label="Editor mode"
    >
      <div className="bg-bg-tertiary inline-flex items-center gap-0.5 rounded-lg p-0.5">
        <button
          type="button"
          role="tab"
          aria-selected={!raw}
          aria-label="Visual editor"
          title="Visual"
          disabled={busy}
          onClick={onVisual}
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-md transition-all disabled:opacity-50',
            !raw
              ? 'bg-bg text-accent shadow-sm'
              : 'text-fg-secondary hover:text-fg',
          )}
        >
          <PenLine className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={raw}
          aria-label="Source (raw markdown)"
          title="Source"
          disabled={busy}
          onClick={onRaw}
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-md transition-all disabled:opacity-50',
            raw
              ? 'bg-bg text-accent shadow-sm'
              : 'text-fg-secondary hover:text-fg',
          )}
        >
          <FileCode className="size-4" aria-hidden />
        </button>
      </div>

      {exportOpen && (
        <>
          <span className="flex-1" />
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                disabled={busy}
                title="Export or print"
                aria-label="Export or print"
                aria-haspopup="menu"
                className="text-fg-muted hover:text-fg hover:bg-bg-hover inline-flex size-8 items-center justify-center gap-0.5 rounded-md transition-colors disabled:opacity-50"
              >
                <FileDown className="size-4" aria-hidden />
                <ChevronDown className="size-3 opacity-70" aria-hidden />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={6}
                align="end"
                className="border-border-strong bg-bg z-50 min-w-[140px] rounded-lg border p-1 shadow-lg"
              >
                {onExportMarkdown && (
                  <DropdownMenu.Item
                    className={dropdownItemClass}
                    disabled={busy}
                    onSelect={() => onExportMarkdown()}
                  >
                    <FileText className="size-4 shrink-0 opacity-80" aria-hidden />
                    Markdown
                  </DropdownMenu.Item>
                )}
                {onPrint && (
                  <DropdownMenu.Item
                    className={dropdownItemClass}
                    disabled={busy}
                    onSelect={() => onPrint()}
                  >
                    <Printer className="size-4 shrink-0 opacity-80" aria-hidden />
                    Print
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </>
      )}
    </div>
  )
}

const dropdownItemClass = cn(
  'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium outline-none',
  'data-[highlighted]:bg-bg-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
)
