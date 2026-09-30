import { describe, expect, it } from 'vitest'
import type { TaskFrontmatter } from '@/types/tasks'
import { defaultTaskFrontmatter, serializeTask, bodyFromTitle, formatDueLabel } from '@/lib/tasks'

describe('tasks serialize', () => {
  it('defaultTaskFrontmatter ignores undefined overrides so priority stays 3', () => {
    const fm = defaultTaskFrontmatter({
      priority: undefined,
      due: '',
      tags: [],
      parent: '',
    })
    expect(fm.priority).toBe(3)
    expect(() => serializeTask(fm, bodyFromTitle('Hello'))).not.toThrow()
  })

  it('serializeTask strips undefined keys from frontmatter', () => {
    const fm = defaultTaskFrontmatter({})
    const dirty = { ...(fm as Record<string, unknown>), stray: undefined }
    expect(() => serializeTask(dirty as unknown as TaskFrontmatter, '\n# T\n')).not.toThrow()
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
