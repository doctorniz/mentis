import type { TaskItem } from '@/types/tasks'
import type { CalendarEvent } from '@/types/calendar'
import { parseEventDate, toDateStr, toDateTimeStr } from '@/lib/calendar'
import { expandEvent } from '@/lib/calendar/recurrence'

/**
 * When reminders fire. The settings live in each item's file — a task's
 * `remind`, an event's `alert` — and so does what was done about them:
 * `reminderAck` (every occurrence up to then is done) and `snoozeUntil` (fire
 * once more then). Everything here is derived from those, so it can always
 * be recomputed.
 *
 * Times are local `YYYY-MM-DDTHH:mm`, which compare correctly as strings.
 */

export interface ReminderOccurrence {
  kind: 'task' | 'event'
  /** The item's file: what the reminder opens. */
  path: string
  title: string
  /** When it fires. */
  at: string
  /** What it is about: the task's due time or the event's start. */
  about: string
}

/** All-day events are reminded about from this time on their day. */
export const ALL_DAY_REMINDER_TIME = '09:00'

const at = (d: Date) => toDateTimeStr(d)
const minus = (time: string, minutes: number) =>
  at(new Date(parseEventDate(time)!.getTime() - minutes * 60_000))

/** Keep what is still to come: after `reminderAck`, plus the snooze if there is one. */
function unsettled(
  occurrences: ReminderOccurrence[],
  item: { reminderAck?: string | null; snoozeUntil?: string | null },
  snoozed: Omit<ReminderOccurrence, 'at'>,
): ReminderOccurrence[] {
  const ack = item.reminderAck ?? ''
  const open = occurrences.filter((o) => o.at > ack)
  if (item.snoozeUntil && item.snoozeUntil > ack) open.push({ ...snoozed, at: item.snoozeUntil })
  return open.sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * A task's reminders in [from, to]. A repeating (weekly) task reminds on each
 * occurrence of its weekday from the `remind` date on, at the same time of
 * day. Done and cancelled tasks do not remind.
 */
export function taskReminders(task: TaskItem, from: Date, to: Date): ReminderOccurrence[] {
  if (!task.remind || task.status === 'done' || task.status === 'cancelled') return []
  const first = parseEventDate(task.remind)
  if (!first) return []
  const base = { kind: 'task' as const, path: task.path, title: task.title }
  const times: Date[] = []
  if (task.repeat === 'weekly' && task.repeatWeekday != null) {
    const d = new Date(first)
    d.setDate(d.getDate() + ((task.repeatWeekday - d.getDay() + 7) % 7))
    // Start near `from` rather than walking every week since the first.
    const weeks = Math.floor((from.getTime() - d.getTime()) / (7 * 86_400_000))
    if (weeks > 0) d.setDate(d.getDate() + 7 * (weeks - 1))
    for (; d <= to; d.setDate(d.getDate() + 7)) if (d >= from) times.push(new Date(d))
  } else if (first >= from && first <= to) {
    times.push(first)
  }
  const occurrences = times.map((t) => ({ ...base, at: at(t), about: at(t) }))
  return unsettled(occurrences, task, { ...base, about: task.remind })
}

/** An event's alerts in [from, to], one per occurrence of a repeating event. */
export function eventReminders(ev: CalendarEvent, from: Date, to: Date): ReminderOccurrence[] {
  if (ev.alert == null) return []
  const base = { kind: 'event' as const, path: ev.path, title: ev.title }
  // An alert fires before its occurrence starts: look that far past `to`.
  const reach = new Date(to.getTime() + ev.alert * 60_000 + 86_400_000)
  const occurrences = expandEvent(
    ev,
    toDateStr(new Date(from.getTime() - 86_400_000)),
    toDateStr(reach),
  )
    .map((o) => {
      const start =
        o.allDay || o.start.length <= 10
          ? `${o.start.slice(0, 10)}T${ALL_DAY_REMINDER_TIME}`
          : o.start
      return { ...base, about: start, at: minus(start, ev.alert!) }
    })
    .filter((o) => o.at >= at(from) && o.at <= at(to))
  return unsettled(occurrences, ev, { ...base, about: ev.start })
}

/** Done: every occurrence up to `now` is dealt with, and a snooze is cleared. */
export function acknowledged(now: Date): { reminderAck: string; snoozeUntil: '' } {
  return { reminderAck: at(now), snoozeUntil: '' }
}

/** Snooze: everything up to `now` is dealt with; remind once more at `until`. */
export function snoozed(now: Date, until: Date): { reminderAck: string; snoozeUntil: string } {
  return { reminderAck: at(now), snoozeUntil: at(until) }
}
