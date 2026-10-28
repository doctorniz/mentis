import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getEffectiveDueDate,
  nextWeeklyDueAfterCompletion,
  nextWeekdayOnOrAfter,
} from '@/lib/tasks/recurrence'

describe('recurrence helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-16T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('nextWeekdayOnOrAfter returns this week Wednesday from Thursday', () => {
    const d = nextWeekdayOnOrAfter(new Date(), 3)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(3)
    expect(d.getDate()).toBe(22)
  })

  it('getEffectiveDueDate is the due day written on the line', () => {
    // Ticking a weekly task writes its next occurrence, so an old date is overdue.
    expect(getEffectiveDueDate({ due: '2020-01-01' })).toBe('2020-01-01')
  })

  it('nextWeeklyDueAfterCompletion skips to following week when completing on due day', () => {
    vi.setSystemTime(new Date('2026-04-22T18:00:00'))
    const next = nextWeeklyDueAfterCompletion(new Date(), 3)
    expect(next).toBe('2026-04-29')
  })
})
