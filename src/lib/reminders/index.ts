import type { TaskItem } from '@/types/tasks'
import type { CalendarEvent } from '@/types/calendar'
import { parseEventDate, toDateStr, toDateTimeStr } from '@/lib/calendar'
import { expandEvent } from '@/lib/calendar/recurrence'
import { taskRef } from './task-ref'

/**
 * When reminders fire. The settings live in the files — a task's time on its
 * due day (`>2026-10-30 09:00`), an event's `alert` — and so does what was
 * done about them: an event's `reminderAck` (every occurrence up to then is
 * done) and either's `snoozeUntil` (fire once more then). A task's Done ticks
 * it. Everything here is derived from those, so it can always be recomputed.
 *
 * Times are local `YYYY-MM-DDTHH:mm`, which compare correctly as strings.
 */

export interface ReminderOccurrence {
  kind: 'task' | 'event'
  /** What the reminder opens: the event's file, or the task's `taskRef`. */
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
 * A task's reminder in [from, to]: at its due day's time, or at its snooze
 * when it has one (the reminder it snoozed is dealt with). A task with no
 * time, or done, does not remind. A weekly task's line holds its current
 * occurrence; ticking it writes the next.
 */
export function taskReminders(task: TaskItem, from: Date, to: Date): ReminderOccurrence[] {
  if (task.done || !task.due || !task.time) return []
  const about = `${task.due}T${task.time}`
  const when = task.snoozeUntil ?? about
  if (when < at(from) || when > at(to)) return []
  return [{ kind: 'task', path: taskRef(task), title: task.title, at: when, about }]
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
