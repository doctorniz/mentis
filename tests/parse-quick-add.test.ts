import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseQuickAdd } from '@/lib/tasks/parse-quick-add'

describe('parseQuickAdd natural language', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-16T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('parses singular weekday as next occurrence and strips phrase', () => {
    const r = parseQuickAdd('Clean house on Wednesday')
    expect(r.title).toBe('Clean house')
    expect(r.repeat).toBeUndefined()
    expect(r.due).toBe('2026-04-22')
  })

  it('parses plural / every weekday as weekly repeat', () => {
    const r = parseQuickAdd('clean on wednesdays')
    expect(r.title.trim()).toBe('clean')
    expect(r.repeat).toBe('weekly')
    expect(r.repeatWeekday).toBe(3)
    expect(r.due).toBe('2026-04-22')
  })

  it('parses every monday without plural s', () => {
    const r = parseQuickAdd('standup every Monday')
    expect(r.repeat).toBe('weekly')
    expect(r.repeatWeekday).toBe(1)
    expect(r.title.trim()).toBe('standup')
  })

  it('prefers explicit > due over inferred weekly due', () => {
    const r = parseQuickAdd('trash >tomorrow every friday')
    expect(r.repeat).toBe('weekly')
    expect(r.repeatWeekday).toBe(5)
    expect(r.due).toBe('2026-04-17')
  })

  it('keeps priority and tags with NL date', () => {
    const r = parseQuickAdd('!2 #home mow lawn on Saturday')
    expect(r.priority).toBe(2)
    expect(r.tags).toContain('home')
    expect(r.title.trim()).toBe('mow lawn')
    expect(r.due).toBe('2026-04-18')
  })
})
