import { describe, it, expect } from 'vitest'
import { toIndexFilters } from '@/lib/search/filters'

describe('toIndexFilters', () => {
  it('passes the other filters through untouched', () => {
    expect(toIndexFilters({ fileType: ['pdf'], folder: 'Notes', tags: ['a'] })).toEqual({
      fileType: ['pdf'],
      folder: 'Notes',
      tags: ['a'],
    })
    expect(toIndexFilters({})).toEqual({})
  })

  it('turns the range into the start of the first day and the end of the last, local time', () => {
    const out = toIndexFilters({ dateRange: { from: '2026-03-05', to: '2026-03-07' } })
    const from = new Date(out.modifiedFrom!)
    const to = new Date(out.modifiedTo!)
    expect([from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds()]).toEqual(
      [0, 0, 0, 0],
    )
    expect([to.getHours(), to.getMinutes(), to.getSeconds(), to.getMilliseconds()]).toEqual([
      23, 59, 59, 999,
    ])
    expect(to.getTime() - from.getTime()).toBeGreaterThan(2 * 86_400_000)
    expect(out).not.toHaveProperty('dateRange')
  })

  it('accepts a one-sided range', () => {
    expect(toIndexFilters({ dateRange: { from: '2026-03-05' } })).not.toHaveProperty('modifiedTo')
    expect(toIndexFilters({ dateRange: { to: '2026-03-05' } })).not.toHaveProperty('modifiedFrom')
  })

  it('places no bound for dates that do not parse', () => {
    expect(toIndexFilters({ dateRange: { from: 'soon', to: '' } })).toEqual({})
  })
})
