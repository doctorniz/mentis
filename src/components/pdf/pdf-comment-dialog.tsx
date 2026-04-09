'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PdfCommentDialog({
  open,
  onOpenChange,
  pageLabel,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageLabel: string
  onSubmit: (text: string) => void
}) {
  const [text, setText] = useState('')

  useEffect(() => {
    if (open) setText('')
  }, [open])

  function handleSubmit() {
    const t = text.trim()
    if (!t) return
    onSubmit(t)
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[199] bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Content className="border-border-strong bg-bg fixed top-1/2 left-1/2 z-[200] w-[min(100%,400px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-fg text-sm font-semibold">Comment</Dialog.Title>
              <Dialog.Description className="text-fg-secondary mt-1 text-xs">
                {pageLabel}
              </Dialog.Description>
            </div>
            <Dialog.Close className="text-fg-muted hover:text-fg shrink-0 rounded-md p-1" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your comment…"
            rows={5}
            className="border-border focus:border-accent focus:ring-accent/20 bg-bg text-fg mt-4 w-full resize-y rounded-lg border px-3 py-2 text-sm leading-relaxed focus:ring-1 focus:outline-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                handleSubmit()
              }
            }}
          />
          <p className="text-fg-muted mt-1 text-[11px]">Ctrl+Enter to save</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => handleSubmit()} disabled={!text.trim()}>
              Add comment
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
