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
      className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 z-[9999] flex flex-col-reverse gap-2 md:bottom-4 md:left-auto"
      style={{ maxWidth: 380 }}
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.variant]
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'bg-bg-secondary toast-enter flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg',
              VARIANT_STYLES[t.variant],
            )}
          >
            <Icon className={cn('mt-0.5 size-5 shrink-0', ICON_STYLES[t.variant])} aria-hidden />
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run()
                  dismiss(t.id)
                }}
                className="text-accent -my-1 shrink-0 rounded px-2 py-1 text-sm font-semibold hover:underline"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-fg-muted hover:text-fg -mt-0.5 -mr-1 shrink-0"
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
