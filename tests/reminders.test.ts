import { describe, expect, it } from 'vitest'
import { eventReminders, taskReminders } from '@/lib/reminders'
import { expandEvent, nthOccurrence } from '@/lib/calendar/recurrence'
import type { TaskItem } from '@/types/tasks'
import type { CalendarEvent } from '@/types/calendar'

const task = (over: Partial<TaskItem>): TaskItem => ({
  id: 'Inbox.md:0',
  path: 'Inbox.md',
  line: 0,
  raw: '- [ ] Call mum',
  indent: 0,
  title: 'Call mum',
  done: false,
  completed: null,
  due: null,
  time: null,
  priority: 3,
  tags: [],
  repeat: null,
  repeatWeekday: null,
  snoozeUntil: null,
  parentLine: null,
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
  it('fires at the time on its due day', () => {
    const r = taskReminders(task({ due: '2026-10-13', time: '09:00' }), from, to)
    expect(r.map((o) => [o.at, o.about])).toEqual([['2026-10-13T09:00', '2026-10-13T09:00']])
    expect(r[0]!.path).toBe('Inbox.md\n- [ ] Call mum')
  })

  it('does not remind without a time, or when done', () => {
    expect(taskReminders(task({ due: '2026-10-13' }), from, to)).toEqual([])
    expect(taskReminders(task({ due: '2026-10-13', time: '09:00', done: true }), from, to)).toEqual(
      [],
    )
  })

  it('fires at the snooze instead of the time it snoozed', () => {
    const r = taskReminders(
      task({ due: '2026-10-13', time: '09:00', snoozeUntil: '2026-10-13T09:11' }),
      from,
      to,
    )
    expect(r.map((o) => o.at)).toEqual(['2026-10-13T09:11'])
  })

  it('stays quiet outside the window', () => {
    expect(taskReminders(task({ due: '2026-12-01', time: '09:00' }), from, to)).toEqual([])
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
