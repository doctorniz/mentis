import { create } from 'zustand'

export type ToastVariant = 'info' | 'success' | 'error' | 'warning'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
  durationMs: number
  createdAt: number
}

interface ToastState {
  toasts: Toast[]
  add: (message: string, variant?: ToastVariant, durationMs?: number) => string
  dismiss: (id: string) => void
}

let counter = 0

const DEFAULTS: Record<ToastVariant, number> = {
  info: 4000,
  success: 3000,
  error: 6000,
  warning: 5000,
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  add: (message, variant = 'info', durationMs?) => {
    const id = `t-${++counter}-${Date.now()}`
    const duration = durationMs ?? DEFAULTS[variant]
    const t: Toast = { id, message, variant, durationMs: duration, createdAt: Date.now() }
    set((s) => ({ toasts: [...s.toasts, t] }))
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
      }, duration)
    }
    return id
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export const toast = {
  info: (msg: string, ms?: number) => useToastStore.getState().add(msg, 'info', ms),
  success: (msg: string, ms?: number) => useToastStore.getState().add(msg, 'success', ms),
  error: (msg: string, ms?: number) => useToastStore.getState().add(msg, 'error', ms),
  warning: (msg: string, ms?: number) => useToastStore.getState().add(msg, 'warning', ms),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
}
