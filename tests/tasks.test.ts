import { describe, expect, it } from 'vitest'
import { dateGroupOf, formatDueLabel } from '@/lib/tasks'

describe('dateGroupOf', () => {
  const now = new Date(2026, 9, 28, 23, 30)
  it.each([
    [null, 'No date'],
    ['2026-10-27', 'Overdue'],
    ['2026-10-28', 'Today'],
    ['2026-10-29', 'Next 7 days'],
    ['2026-11-04', 'Next 7 days'],
    ['2026-11-05', 'Later'],
  ] as const)('puts %s under %s', (due, group) => {
    expect(dateGroupOf({ due }, now)).toBe(group)
  })
})

describe('formatDueLabel', () => {
  // Late evening is where a millisecond-based count used to tip a day over.
  const lateEvening = new Date(2026, 9, 1, 23, 30)
  const earlyMorning = new Date(2026, 9, 1, 0, 5)

  it.each([lateEvening, earlyMorning])('counts local calendar days at %s', (now) => {
    expect(formatDueLabel('2026-10-01', now)).toBe('Today')
    expect(formatDueLabel('2026-10-02', now)).toBe('Tomorrow')
    expect(formatDueLabel('2026-09-30', now)).toBe('1d overdue')
    expect(formatDueLabel('2026-09-28', now)).toBe('3d overdue')
  })

  it('uses a weekday within the week and a date after it', () => {
    const now = new Date(2026, 9, 1, 12)
    expect(formatDueLabel('2026-10-05', now)).toBe(
      new Date(2026, 9, 5).toLocaleDateString(undefined, { weekday: 'short' }),
    )
    expect(formatDueLabel('2026-10-20', now)).toBe(
      new Date(2026, 9, 20).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    )
  })

  it('returns text it cannot read as is', () => {
    expect(formatDueLabel('soon')).toBe('soon')
  })
})
