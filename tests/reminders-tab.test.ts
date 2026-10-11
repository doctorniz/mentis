import { describe, it, expect } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { ReminderRow } from '@/core/index/protocol'
import { groupReminders, reminderTabRange } from '@/lib/reminders/group'
import { journalPromptRows, promptTime } from '@/lib/reminders/journal-prompt'
import { DEFAULT_VAULT_CONFIG, type VaultConfig } from '@/types/vault'

const row = (at: string, title = at): ReminderRow => ({
  kind: 'task',
  path: `${title}.md`,
  title,
  at,
  about: at,
})

describe('groupReminders', () => {
  // Sunday 11 October 2026, 14:30.
  const now = new Date(2026, 9, 11, 14, 30)

  it('covers the last week through the end of the seventh day ahead', () => {
    expect(reminderTabRange(now)).toEqual({ from: '2026-10-04T14:30', to: '2026-10-19T00:00' })
  })

  it('sorts into missed, today, tomorrow and later, earliest first', () => {
    const g = groupReminders(
      [
        row('2026-10-18T23:59', 'last day'),
        row('2026-10-12T08:00', 'tomorrow'),
        row('2026-10-11T14:30', 'this minute'),
        row('2026-10-11T14:31', 'soon'),
        row('2026-10-10T09:00', 'yesterday'),
        row('2026-10-04T14:29', 'too old'),
        row('2026-10-19T00:00', 'too far'),
        row('2026-10-13T09:00', 'tuesday'),
      ],
      now,
    )
    const titles = (rows: ReminderRow[]) => rows.map((r) => r.title)
    expect(titles(g.missed)).toEqual(['yesterday', 'this minute'])
    expect(titles(g.today)).toEqual(['soon'])
    expect(titles(g.tomorrow)).toEqual(['tomorrow'])
    expect(titles(g.later)).toEqual(['tuesday', 'last day'])
  })
})

describe('journalPromptRows', () => {
  const now = new Date(2026, 9, 11, 14, 30)
  const config: VaultConfig = { ...DEFAULT_VAULT_CONFIG, journalPrompt: '21:00' }
  const fsWith = (paths: string[]) =>
    ({ exists: async (p: string) => paths.includes(p) }) as unknown as FileSystemAdapter
  const todayPath = '_mentis/_journals/2026-10-11.md'

  it('reads only a real time as the prompt time', () => {
    expect(promptTime({ journalPrompt: '21:00' })).toBe('21:00')
    expect(promptTime({ journalPrompt: '' })).toBeNull()
    expect(promptTime({ journalPrompt: '25:00' })).toBeNull()
  })

  it('prompts today at the set time while today has no journal', async () => {
    expect(await journalPromptRows(fsWith([]), config, {}, now)).toEqual([
      {
        kind: 'journal',
        path: todayPath,
        title: 'Write today’s journal',
        at: '2026-10-11T21:00',
        about: '2026-10-11T21:00',
      },
    ])
  })

  it('does not prompt once the day is written, dismissed, or the prompt is off', async () => {
    expect(await journalPromptRows(fsWith([todayPath]), config, {}, now)).toEqual([])
    expect(await journalPromptRows(fsWith([]), config, { done: '2026-10-11' }, now)).toEqual([])
    expect(await journalPromptRows(fsWith([]), { ...config, journalPrompt: '' }, {}, now)).toEqual(
      [],
    )
  })

  it('prompts again at a snooze later the same day, and ignores another day’s', async () => {
    const at = async (snoozeUntil: string) =>
      (await journalPromptRows(fsWith([]), config, { snoozeUntil }, now))[0]?.at
    expect(await at('2026-10-11T21:10')).toBe('2026-10-11T21:10')
    expect(await at('2026-10-10T22:00')).toBe('2026-10-11T21:00')
  })
})
