import type { FileSystemAdapter } from '@/lib/fs/types'
import { MOBILE_NAV_MEDIA_QUERY } from '@/lib/browser/breakpoints'
import { HOME_VIEW, viewIdOrHome } from '@/core/registries'
import { createUntitledNote } from '@/lib/notes/new-note'
import { useEditorStore } from '@/stores/editor'
import { useUiStore } from '@/stores/ui'

/**
 * What a vault opens to. A choice for this device, not for the vault: a phone and a
 * desktop sharing a vault can open to different places.
 */
export const START_CHOICES = [
  { value: 'notes', label: 'Notes' },
  { value: 'today', label: 'Today' },
  { value: 'new-note', label: 'New note' },
  { value: 'last-file', label: 'Last file opened' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'chat', label: 'Chat' },
] as const

export type StartChoice = (typeof START_CHOICES)[number]['value']

const CHOICE_KEY = 'mentis.startView'
const lastFileKey = (vaultPath: string) => `mentis.lastFile:${vaultPath}`

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // not remembered; the default applies
  }
}

export function getStartChoice(): StartChoice {
  const v = read(CHOICE_KEY)
  return START_CHOICES.some((c) => c.value === v) ? (v as StartChoice) : 'notes'
}

export function setStartChoice(choice: StartChoice) {
  write(CHOICE_KEY, choice)
}

/** Remember the file the user is on, for "Last file opened". */
export function rememberLastFile(vaultPath: string, path: string | null) {
  if (path) write(lastFileKey(vaultPath), path)
}

/** Notes is the file tree on a phone, and the editor beside its sidebar tree elsewhere. */
function notesView() {
  return window.matchMedia(MOBILE_NAV_MEDIA_QUERY).matches ? viewIdOrHome('tree') : HOME_VIEW
}

/** Show what this device opens to; a choice that cannot be met opens Notes. */
export async function applyStartView(fs: FileSystemAdapter, vaultPath: string) {
  const ui = useUiStore.getState()
  const openNote = (path: string) => {
    ui.setActiveView(HOME_VIEW)
    useEditorStore.getState().setPendingVaultOpenPath(path)
  }
  ui.setActiveView(notesView())

  switch (getStartChoice()) {
    case 'today':
      ui.setActiveView(viewIdOrHome('journal'))
      break
    case 'calendar':
      ui.setActiveView(viewIdOrHome('calendar'))
      break
    case 'tasks':
      ui.setActiveView(viewIdOrHome('tasks'))
      break
    case 'chat':
      // Chat is off until switched on; then Notes.
      ui.setActiveView(viewIdOrHome('vault-chat') === 'vault-chat' ? 'vault-chat' : notesView())
      break
    case 'new-note':
      openNote(await createUntitledNote(fs))
      window.dispatchEvent(new CustomEvent('ink:vault-changed'))
      break
    case 'last-file': {
      const path = read(lastFileKey(vaultPath))
      if (path && (await fs.exists(path).catch(() => false))) openNote(path)
      break
    }
    default:
      break
  }
}
