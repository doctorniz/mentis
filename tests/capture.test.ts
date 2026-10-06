import { describe, expect, it } from 'vitest'
import {
  createCaptureRegistry,
  DEFAULT_CAPTURE_DESTINATION,
  type CaptureContext,
  type CaptureDestination,
} from '@/core/registries/capture'
import { CaptureText, extractPriority } from '@/core/capture/parse'
import { captureDestinations } from '@/core/registries'

const stub = (id: string, sigil: string, aliases: string[] = []): CaptureDestination => ({
  id,
  sigil,
  aliases,
  label: id[0]!.toUpperCase() + id.slice(1),
  icon: (() => null) as never,
  hint: '',
  immediate: true,
  parseNow: (input) => ({ values: {}, matchedSpans: [], residual: input }),
  parse: async (input) => ({ values: {}, matchedSpans: [], residual: input }),
  write: async () => ({}),
})

describe('createCaptureRegistry', () => {
  it('refuses a duplicate id or a sigil claimed twice', () => {
    expect(() => createCaptureRegistry([stub('a', '/a'), stub('a', '/b')])).toThrow(
      'registered twice',
    )
    expect(() => createCaptureRegistry([stub('a', '/a'), stub('b', '/b', ['/A'])])).toThrow(
      'Sigil "/A" is claimed by "a" and "b"',
    )
  })

  it('finds a destination by sigil or alias, ignoring case, and searches by prefix or label', () => {
    const r = createCaptureRegistry([stub('task', '/task', ['/todo']), stub('cal', '/cal')])
    expect(r.bySigil('/TODO')?.id).toBe('task')
    expect(r.bySigil('/ta')).toBeUndefined()
    expect(r.search('/to').map((d) => d.id)).toEqual(['task'])
    expect(r.search('').map((d) => d.id)).toEqual(['task', 'cal'])
  })
})

describe('registered destinations', () => {
  it('has Thoughts as the default and Task reachable by /task and /todo', () => {
    expect(captureDestinations.get(DEFAULT_CAPTURE_DESTINATION)?.label).toBe('Thought')
    expect(captureDestinations.bySigil('/task')?.id).toBe('task')
    expect(captureDestinations.bySigil('/todo')?.id).toBe('task')
  })
})

describe('CaptureText', () => {
  it('claims the winning value only, leaving the others in the text', () => {
    const t = new CaptureText('ship it !1 !2')
    expect(extractPriority(t)).toBe(2)
    expect(t.residual()).toBe('ship it !1')
    expect(t.spans).toEqual([{ start: 11, end: 13, field: 'priority' }])
  })
})

describe('task destination parse', () => {
  const task = captureDestinations.get('task')!
  // Tuesday 6 October 2026, 10:00 local time.
  const ctx: CaptureContext = {
    vaultFs: {} as never,
    scope: { list: 'Home' },
    now: new Date(2026, 9, 6, 10, 0),
  }
  const parse = (input: string) => task.parse(input, ctx)

  it('keeps an unresolvable >token in the title instead of dropping it', async () => {
    const r = await parse('call Bob >soonish')
    expect(r.values.title).toBe('call Bob >soonish')
    expect(r.values.due).toBeUndefined()
  })

  it('reads a natural date when no explicit one is given', async () => {
    const r = await parse('call mum tomorrow')
    expect(r.values.title).toBe('call mum')
    expect(r.values.due).toBe('2026-10-07')
    expect(r.values.list).toBe('Home')
  })

  it('lets an explicit >date win over a natural one, which stays in the title', async () => {
    const r = await parse('pay rent in three weeks >tomorrow')
    expect(r.values.due).toBe('2026-10-07')
    expect(r.values.title).toBe('pay rent in three weeks')
  })

  it('keeps times and ranges a task cannot store in the title', async () => {
    const timed = await parse('dentist friday at 7pm')
    expect(timed.values.due).toBeUndefined()
    expect(timed.values.title).toBe('dentist friday at 7pm')

    const range = await parse('conference 12-14 nov')
    expect(range.values.due).toBeUndefined()
    expect(range.values.title).toBe('conference 12-14 nov')
  })

  it('claims a whole "on mondays" phrase as the recurrence', async () => {
    const r = await parse('bins on mondays')
    expect(r.values.repeat).toBe('weekly')
    expect(r.values.title).toBe('bins')
  })

  it('drops nothing: every word is in the title or a matched span', async () => {
    for (const input of [
      'Buy milk !1 #grocery >today',
      'standup every monday #work',
      'call mum tomorrow !5',
      'trash >tomorrow every friday on tuesday',
      'read chapter 12 by friday #book #book',
      'dentist next tuesday at 7pm',
    ]) {
      const r = await parse(input)
      const claimed = [...r.matchedSpans]
        .sort((a, b) => a.start - b.start)
        .map((s) => input.slice(s.start, s.end))
      const words = (s: string) => s.split(/\s+/).filter(Boolean)
      expect([...words(String(r.values.title)), ...claimed.flatMap(words)].sort()).toEqual(
        words(input).sort(),
      )
    }
  })
})
