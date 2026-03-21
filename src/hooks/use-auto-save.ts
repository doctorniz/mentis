import { useEffect, useRef, useCallback } from 'react'

interface UseAutoSaveOptions {
  intervalMs?: number
  saveOnBlur?: boolean
  enabled?: boolean
  onSave: () => void | Promise<void>
  isDirty: boolean
}

export function useAutoSave({
  intervalMs = 30_000,
  saveOnBlur = true,
  enabled = true,
  onSave,
  isDirty,
}: UseAutoSaveOptions) {
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  const save = useCallback(async () => {
    if (!isDirty) return
    await saveRef.current()
  }, [isDirty])

  useEffect(() => {
    if (!enabled || !isDirty) return

    const timer = setInterval(save, intervalMs)
    return () => clearInterval(timer)
  }, [enabled, isDirty, intervalMs, save])

  useEffect(() => {
    if (!enabled || !saveOnBlur || !isDirty) return

    const handleBlur = () => {
      save()
    }

    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [enabled, saveOnBlur, isDirty, save])

  useEffect(() => {
    if (!enabled || !isDirty) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [enabled, isDirty])

  return { save }
}
