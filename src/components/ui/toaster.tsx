'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from 'lucide-react'
import { useToastStore, type ToastVariant } from '@/stores/toast'
import { cn } from '@/utils/cn'

const ICONS: Record<ToastVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: 'border-accent/30 text-fg',
  success: 'border-success/30 text-fg',
  error: 'border-danger/30 text-fg',
  warning: 'border-warning/30 text-fg',
}

const ICON_STYLES: Record<ToastVariant, string> = {
  info: 'text-accent',
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || toasts.length === 0) return null

  return createPortal(
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed right-4 bottom-4 z-[9999] flex flex-col-reverse gap-2"
      style={{ maxWidth: 380 }}
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.variant]
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'bg-bg-secondary border shadow-lg rounded-lg px-4 py-3 flex items-start gap-3 toast-enter',
              VARIANT_STYLES[t.variant],
            )}
          >
            <Icon className={cn('size-5 shrink-0 mt-0.5', ICON_STYLES[t.variant])} aria-hidden />
            <p className="text-sm flex-1 leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-fg-muted hover:text-fg shrink-0 -mt-0.5 -mr-1"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
