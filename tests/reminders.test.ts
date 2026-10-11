import { describe, expect, it } from 'vitest'
import { eventReminders, taskReminders, acknowledged, snoozed } from '@/lib/reminders'
import { expandEvent, nthOccurrence } from '@/lib/calendar/recurrence'
import type { TaskItem } from '@/types/tasks'
import type { CalendarEvent } from '@/types/calendar'

const task = (over: Partial<TaskItem>): TaskItem => ({
  path: '_mentis/_tasks/t.md',
  uid: 'u',
  title: 'Call mum',
  body: '',
  status: 'todo',
  priority: 3,
  due: null,
  created: '',
  modified: '',
  completed: null,
  tags: [],
  list: null,
  parent: null,
  order: 0,
  repeat: null,
  repeatWeekday: null,
  remind: null,
  reminderAck: null,
  snoozeUntil: null,
  children: [],
  ...over,
})

const event = (over: Partial<CalendarEvent>): CalendarEvent => ({
  path: '_mentis/_calendar/e.md',
  uid: 'e',
  title: 'Dentist',
  body: '',
  start: '2026-10-13T19:00',
  end: '2026-10-13T20:00',
  allDay: false,
  color: 'violet',
  created: '',
  modified: '',
  ...over,
})

// The week of Monday 12 October 2026.
const from = new Date(2026, 9, 12, 0, 0)
const to = new Date(2026, 9, 18, 23, 59)

describe('repeating events', () => {
  it('keeps the day of the month, falling back to the last day in short months', () => {
    const jan31 = new Date(2026, 0, 31, 10, 0)
    expect(nthOccurrence(jan31, 'monthly', 1).toDateString()).toBe(
      new Date(2026, 1, 28).toDateString(),
    )
    expect(nthOccurrence(jan31, 'monthly', 2).getDate()).toBe(31)
    const leap = new Date(2028, 1, 29)
    expect(nthOccurrence(leap, 'yearly', 1).getDate()).toBe(28)
    expect(nthOccurrence(leap, 'yearly', 4).getDate()).toBe(29)
  })

  it('expands a weekly event into each occurrence in range, keeping its length', () => {
    const ev = event({ start: '2026-09-01T09:00', end: '2026-09-01T09:30', repeat: 'weekly' })
    const occ = expandEvent(ev, '2026-10-01', '2026-10-31')
    expect(occ.map((o) => o.start)).toEqual([
      '2026-10-06T09:00',
      '2026-10-13T09:00',
      '2026-10-20T09:00',
      '2026-10-27T09:00',
    ])
    expect(occ[0]!.end).toBe('2026-10-06T09:30')
    expect(occ.every((o) => o.path === ev.path)).toBe(true)
  })

  it('leaves an event without repeat as it is', () => {
    expect(expandEvent(event({}), '2026-10-01', '2026-10-31')).toHaveLength(1)
    expect(expandEvent(event({}), '2026-11-01', '2026-11-30')).toHaveLength(0)
  })
})

describe('task reminders', () => {
  it('fires once at the remind time', () => {
    const r = taskReminders(task({ remind: '2026-10-13T09:00' }), from, to)
    expect(r.map((o) => o.at)).toEqual(['2026-10-13T09:00'])
  })

  it('fires each week on a weekly task, at the same time of day', () => {
    const weekly = task({ remind: '2026-09-07T08:30', repeat: 'weekly', repeatWeekday: 1 })
    const r = taskReminders(weekly, from, new Date(2026, 9, 26, 23, 59))
    expect(r.map((o) => o.at)).toEqual(['2026-10-12T08:30', '2026-10-19T08:30', '2026-10-26T08:30'])
  })

  it('does not remind about done tasks', () => {
    expect(taskReminders(task({ remind: '2026-10-13T09:00', status: 'done' }), from, to)).toEqual(
      [],
    )
  })

  it('drops what Done covered, and fires again at a snooze', () => {
    const done = { ...acknowledged(new Date(2026, 9, 13, 9, 1)) }
    expect(taskReminders(task({ remind: '2026-10-13T09:00', ...done }), from, to)).toEqual([])

    const later = snoozed(new Date(2026, 9, 13, 9, 1), new Date(2026, 9, 13, 9, 11))
    const r = taskReminders(task({ remind: '2026-10-13T09:00', ...later }), from, to)
    expect(r.map((o) => o.at)).toEqual(['2026-10-13T09:11'])
  })
})

describe('event alerts', () => {
  it('fires the alert minutes before the start', () => {
    expect(eventReminders(event({ alert: 15 }), from, to).map((o) => o.at)).toEqual([
      '2026-10-13T18:45',
    ])
  })

  it('fires before every occurrence of a repeating event', () => {
    const daily = event({
      start: '2026-10-01T07:00',
      end: '2026-10-01T07:15',
      repeat: 'daily',
      alert: 0,
    })
    expect(eventReminders(daily, from, to)).toHaveLength(7)
  })

  it('counts an all-day event’s alert from 09:00 on its day', () => {
    const allDay = event({ start: '2026-10-14', end: '2026-10-14', allDay: true, alert: 1440 })
    expect(eventReminders(allDay, from, to).map((o) => o.at)).toEqual(['2026-10-13T09:00'])
  })

  it('does not alert without an Alert', () => {
    expect(eventReminders(event({}), from, to)).toEqual([])
  })
})
