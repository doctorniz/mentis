import type { ReminderRow } from '@/core/index/protocol'
import { toDateStr, toDateTimeStr } from '@/lib/calendar'

/** How far back a reminder not yet Done still counts as missed, and how far ahead Upcoming reaches. */
export const MISSED_DAYS = 7
export const UPCOMING_DAYS = 7

export interface ReminderGroups {
  missed: ReminderRow[]
  today: ReminderRow[]
  tomorrow: ReminderRow[]
  later: ReminderRow[]
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** The local `YYYY-MM-DDTHH:mm` range the Reminders tab covers at `now`. */
export function reminderTabRange(now: Date): { from: string; to: string } {
  return {
    from: toDateTimeStr(new Date(now.getTime() - MISSED_DAYS * 86_400_000)),
    to: `${toDateStr(addDays(now, UPCOMING_DAYS + 1))}T00:00`,
  }
}

/**
 * Sort reminders into the tab's sections: missed (fell due in the last week
 * and not Done), then what is still to come today, tomorrow, and later in
 * the week.
 */
export function groupReminders(rows: readonly ReminderRow[], now: Date): ReminderGroups {
  const { from, to } = reminderTabRange(now)
  const nowAt = toDateTimeStr(now)
  const today = toDateStr(now)
  const tomorrow = toDateStr(addDays(now, 1))
  const groups: ReminderGroups = { missed: [], today: [], tomorrow: [], later: [] }
  for (const r of [...rows].sort((a, b) => a.at.localeCompare(b.at))) {
    if (r.at < from || r.at >= to) continue
    if (r.at <= nowAt) groups.missed.push(r)
    else if (r.at.startsWith(today)) groups.today.push(r)
    else if (r.at.startsWith(tomorrow)) groups.tomorrow.push(r)
    else groups.later.push(r)
  }
  return groups
}
