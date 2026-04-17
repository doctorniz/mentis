import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskItem } from '@/types/tasks'
import {
  getEffectiveDueDate,
  nextWeeklyDueAfterCompletion,
  nextWeekdayOnOrAfter,
} from '@/lib/tasks/recurrence'

function baseTask(partial: Partial<TaskItem>): TaskItem {
  return {
    path: 'x.md',
    uid: 'u',
    title: 'T',
    body: '',
    status: 'todo',
    priority: 3,
    due: null,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    completed: null,
    tags: [],
    list: null,
    parent: null,
    order: 0,
    repeat: null,
    repeatWeekday: null,
    children: [],
    ...partial,
  }
}

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

  it('getEffectiveDueDate advances stale stored due for weekly tasks', () => {
    const task = baseTask({
      repeat: 'weekly',
      repeatWeekday: 3,
      due: '2020-01-01',
    })
    expect(getEffectiveDueDate(task)).toBe('2026-04-22')
  })

  it('nextWeeklyDueAfterCompletion skips to following week when completing on due day', () => {
    vi.setSystemTime(new Date('2026-04-22T18:00:00'))
    const next = nextWeeklyDueAfterCompletion(new Date(), 3)
    expect(next).toBe('2026-04-29')
  })
})
