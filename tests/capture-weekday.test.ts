import { describe, it, expect } from 'vitest'
import { CaptureText, extractWeekday } from '@/core/capture/parse'

// Tuesday 2026-10-13, mid-morning.
const tuesday = new Date(2026, 9, 13, 10, 0)
const day = (input: string, now = tuesday) => extractWeekday(new CaptureText(input), now)

describe('weekday phrases (CAP1)', () => {
  it('reads "next tuesday" said on a Tuesday as next week, as events do', () => {
    expect(day('Call mum next tuesday')).toBe('2026-10-20')
  })
  it('keeps "on tuesday" and "this tuesday" as today', () => {
    expect(day('Call mum on tuesday')).toBe('2026-10-13')
    expect(day('Call mum this tuesday')).toBe('2026-10-13')
  })
  it('reads "next friday" as the coming Friday', () => {
    expect(day('Report next friday')).toBe('2026-10-16')
  })
})
