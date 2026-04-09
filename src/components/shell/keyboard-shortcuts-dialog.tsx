'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { KEYBOARD_SHORTCUTS, formatShortcut, type KeyboardShortcut } from '@/lib/keyboard-shortcuts'

const CATEGORIES = ['Global', 'Editor', 'Canvas', 'PDF'] as const

function ShortcutRow({ shortcut }: { shortcut: KeyboardShortcut }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-fg-secondary text-sm">{shortcut.description}</span>
      <kbd className="bg-bg-tertiary border-border text-fg-muted rounded border px-1.5 py-0.5 font-mono text-xs">
        {formatShortcut(shortcut)}
      </kbd>
    </div>
  )
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[199] bg-black/40" />
        <Dialog.Content className="border-border-strong bg-bg fixed top-1/2 left-1/2 z-[200] max-h-[80vh] w-[min(100%,520px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-5 shadow-lg">
          <Dialog.Title className="text-fg text-base font-semibold">
            Keyboard Shortcuts
          </Dialog.Title>

          <div className="mt-4 space-y-5">
            {CATEGORIES.map((cat) => {
              const items = KEYBOARD_SHORTCUTS.filter((s) => s.category === cat)
              if (items.length === 0) return null
              return (
                <div key={cat}>
                  <h3 className="text-fg mb-1.5 text-xs font-bold uppercase tracking-wider">
                    {cat}
                  </h3>
                  <div className="divide-border divide-y">
                    {items.map((s, i) => (
                      <ShortcutRow key={i} shortcut={s} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-fg-secondary hover:text-fg text-sm underline"
            >
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
