import { describe, expect, it } from 'vitest'
import type { CaptureContext } from '@/core/registries/capture'
import { captureDestinations } from '@/core/registries'

// Tuesday 6 October 2026, 10:20 local time.
const ctx: CaptureContext = { vaultFs: {} as never, scope: {}, now: new Date(2026, 9, 6, 10, 20) }

describe('calendar destination', () => {
  const cal = captureDestinations.get('calendar')!
  const parse = (input: string) => cal.parse(input, ctx)

  it('is reached by /cal and asks for confirmation', () => {
    expect(captureDestinations.bySigil('/cal')).toBe(cal)
    expect(cal.immediate).toBe(false)
  })

  it('reads a day and time, ending an hour later', async () => {
    const r = await parse('Dentist next tuesday at 7pm')
    expect(r.values).toMatchObject({
      title: 'Dentist',
      allDay: false,
      start: '2026-10-13T19:00',
      end: '2026-10-13T20:00',
    })
  })

  it('reads a time range', async () => {
    const r = await parse('Standup tomorrow 9am-9:30am')
    expect(r.values).toMatchObject({ start: '2026-10-07T09:00', end: '2026-10-07T09:30' })
  })

  it('makes a span of days with no time an all-day event', async () => {
    const r = await parse('Conference 12-14 nov')
    expect(r.values).toMatchObject({ allDay: true, start: '2026-11-12', end: '2026-11-14' })
  })

  it('starts at the next hour when no date is given', async () => {
    const r = await parse('Call the bank')
    expect(r.values).toMatchObject({ start: '2026-10-06T11:00', end: '2026-10-06T12:00' })
  })

  it('lets an explicit >date set the day, taking only a time from the text', async () => {
    const r = await parse('Lunch >2026-10-20 at 1pm')
    expect(r.values.start).toBe('2026-10-20T13:00')
    expect(r.values.title).toBe('Lunch')
  })

  it('keeps a phrase naming a second day in the title rather than splitting it', async () => {
    const r = await parse('Lunch >2026-10-20 at 1pm tomorrow')
    expect(r.values.start).toBe('2026-10-20T11:00')
    expect(r.values.title).toBe('Lunch at 1pm tomorrow')
  })

  it('never parses a location: it stays in the title', async () => {
    const r = await parse('Dinner at the Sheraton Hotel friday 7pm')
    expect(r.values.title).toBe('Dinner at the Sheraton Hotel')
    expect(r.values.location).toBe('')
  })

  it('blocks an end before the start', () => {
    expect(
      cal.validate!({ allDay: false, start: '2026-10-06T10:00', end: '2026-10-06T09:00' }),
    ).toBe('Ends must be after Starts')
    expect(cal.validate!({ allDay: true, start: '2026-10-06', end: '2026-10-06' })).toBeNull()
  })
})

describe('bookmark destination', () => {
  const bm = captureDestinations.get('bookmark')!

  it('takes the link, tags and the rest as notes; the title starts as the hostname', async () => {
    const r = await bm.parse('read later https://www.example.com/post?id=1 #reading', ctx)
    expect(r.values).toMatchObject({
      url: 'https://www.example.com/post?id=1',
      title: 'example.com',
      notes: 'read later',
      tags: ['reading'],
    })
  })

  it('adds https:// to a bare www. link and rejects a non-link', async () => {
    const r = await bm.parse('www.example.org', ctx)
    expect(r.values.url).toBe('https://www.example.org')
    expect(bm.validate!({ url: 'example' })).toMatch(/full link/)
  })
})
