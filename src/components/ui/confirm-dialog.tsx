'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="border-border bg-bg fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border shadow-2xl">
          <div className="flex items-start gap-3 px-5 pt-5 pb-2">
            {variant === 'danger' && (
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-red-500/10">
                <AlertTriangle className="size-[18px] text-red-500" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-fg text-sm font-semibold">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-fg-secondary mt-1 text-xs leading-relaxed">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="text-fg-muted hover:text-fg shrink-0 rounded-md p-1">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="flex justify-end gap-2 px-5 pt-3 pb-5">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button
              variant={variant === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onClick={() => { onConfirm(); onOpenChange(false) }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
