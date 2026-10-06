import { views } from '@/core/registries'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  description: string
  category: 'Global' | 'Editor' | 'Canvas' | 'PDF'
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { key: 's', ctrl: true, description: 'Save current file', category: 'Global' },
  { key: 'k', ctrl: true, description: 'Open the command palette', category: 'Global' },
  { key: 'n', ctrl: true, description: 'Open the New menu', category: 'Global' },
  { key: 'f', ctrl: true, description: 'Search the vault', category: 'Global' },
  // Ctrl+<digit> view switching, straight from the view registry.
  ...views
    .nav()
    .filter((v) => v.nav?.shortcut)
    .map(
      (v): KeyboardShortcut => ({
        key: v.nav!.shortcut!,
        ctrl: true,
        description: `Switch to ${v.label} view`,
        category: 'Global',
      }),
    ),
  { key: '\\', ctrl: true, description: 'Toggle sidebar', category: 'Global' },
  { key: '?', ctrl: true, shift: true, description: 'Show keyboard shortcuts', category: 'Global' },
  { key: 'b', ctrl: true, description: 'Bold text', category: 'Editor' },
  { key: 'i', ctrl: true, description: 'Italic text', category: 'Editor' },
  { key: 'u', ctrl: true, description: 'Underline text', category: 'Editor' },
  { key: '/', description: 'Open slash command menu', category: 'Editor' },
  { key: '[[', description: 'Open wiki-link autocomplete', category: 'Editor' },
  { key: 'b', description: 'Brush tool', category: 'Canvas' },
  { key: 'e', description: 'Eraser tool', category: 'Canvas' },
  { key: 'h', description: 'Pan tool', category: 'Canvas' },
  { key: 'g', description: 'Fill tool', category: 'Canvas' },
  { key: 'i', description: 'Eyedropper tool', category: 'Canvas' },
  { key: '[ / ]', description: 'Decrease / increase brush size', category: 'Canvas' },
  { key: 'z', ctrl: true, description: 'Undo', category: 'Canvas' },
  { key: 'z', ctrl: true, shift: true, description: 'Redo', category: 'Canvas' },
  { key: '+/-', ctrl: true, description: 'Zoom in/out', category: 'PDF' },
  { key: 'ArrowLeft/Right', description: 'Previous/next page', category: 'PDF' },
]

export function formatShortcut(s: KeyboardShortcut): string {
  const parts: string[] = []
  if (s.ctrl) parts.push('Ctrl')
  if (s.shift) parts.push('Shift')
  if (s.alt) parts.push('Alt')
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key)
  return parts.join(' + ')
}
