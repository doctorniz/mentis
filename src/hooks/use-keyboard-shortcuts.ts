import { useEffect } from 'react'

type KeyCombo = {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
}

type ShortcutHandler = (e: KeyboardEvent) => void

interface Shortcut {
  combo: KeyCombo
  handler: ShortcutHandler
  description?: string
}

function matchesCombo(e: KeyboardEvent, combo: KeyCombo): boolean {
  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const modKey = isMac ? e.metaKey : e.ctrlKey

  if (combo.ctrl || combo.meta) {
    if (!modKey) return false
  } else {
    if (modKey) return false
  }

  if (combo.shift && !e.shiftKey) return false
  if (!combo.shift && e.shiftKey) return false
  if (combo.alt && !e.altKey) return false
  if (!combo.alt && e.altKey) return false

  return e.key.toLowerCase() === combo.key.toLowerCase()
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      for (const shortcut of shortcuts) {
        if (matchesCombo(e, shortcut.combo)) {
          e.preventDefault()
          shortcut.handler(e)
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}
