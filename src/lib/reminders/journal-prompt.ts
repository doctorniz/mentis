import type { FileSystemAdapter } from '@/lib/fs/types'
import type { ReminderRow } from '@/core/index/protocol'
import type { VaultConfig } from '@/types/vault'
import { journalPath } from '@/lib/journal'
import { toDateStr } from '@/lib/calendar'

/**
 * The evening journal prompt: at the time set in Settings › Journal, a
 * reminder to write, but only while the day has no journal yet. It has no
 * file of its own to record Done or Snooze in, so those are kept per vault in
 * this browser; losing them means at most one extra prompt.
 */

export interface JournalPromptState {
  /** The day (YYYY-MM-DD) the prompt was dismissed for. */
  done?: string
  /** Prompt once more at this local time. */
  snoozeUntil?: string
}

export const JOURNAL_PROMPT_TITLE = 'Write today’s journal'

const key = (vaultKey: string) => `mentis.reminders.journal:${vaultKey}`

export function loadJournalPromptState(vaultKey: string): JournalPromptState {
  try {
    const v = JSON.parse(localStorage.getItem(key(vaultKey)) ?? '{}') as JournalPromptState
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function saveJournalPromptState(vaultKey: string, state: JournalPromptState): void {
  try {
    localStorage.setItem(key(vaultKey), JSON.stringify(state))
  } catch {
    /* not kept: at worst one extra prompt */
  }
}

/** `HH:mm`, or null when the prompt is off or the time is not one. */
export function promptTime(config: Pick<VaultConfig, 'journalPrompt'>): string | null {
  const t = config.journalPrompt?.trim() ?? ''
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null
}

/**
 * Today's journal prompt, if it is on and today has no journal: at the set
 * time, or at the snooze when there is one for today. Only today's: a
 * prompt for an earlier day can no longer be acted on.
 */
export async function journalPromptRows(
  fs: FileSystemAdapter,
  config: VaultConfig,
  state: JournalPromptState,
  now: Date,
): Promise<ReminderRow[]> {
  const time = promptTime(config)
  if (!time || config.dailyNotesEnabled === false) return []
  const day = toDateStr(now)
  if (state.done === day) return []
  const path = journalPath(config, now)
  if (await fs.exists(path).catch(() => false)) return []
  const set = `${day}T${time}`
  const snooze = state.snoozeUntil?.startsWith(day) ? state.snoozeUntil : ''
  const at = snooze > set ? snooze : set
  return [{ kind: 'journal', path, title: JOURNAL_PROMPT_TITLE, at, about: at }]
}
