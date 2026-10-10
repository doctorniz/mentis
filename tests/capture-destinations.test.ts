// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import { useEditorStore } from '@/stores/editor'
import { useVaultStore } from '@/stores/vault'
import { DEFAULT_VAULT_CONFIG } from '@/types/vault'
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

/** Just enough of a vault for the destinations' writes. */
function memVault(files: Record<string, string> = {}) {
  const store = new Map(Object.entries(files))
  const dirs = new Set<string>()
  const fs = {
    exists: async (p: string) => store.has(p) || dirs.has(p),
    mkdir: async (p: string) => void dirs.add(p),
    readTextFile: async (p: string) => {
      const v = store.get(p)
      if (v == null) throw new Error(`missing ${p}`)
      return v
    },
    writeTextFile: async (p: string, c: string) => void store.set(p, c),
    readdir: async () => [],
  } as unknown as FileSystemAdapter
  return { fs, store }
}

describe('note destination', () => {
  const note = captureDestinations.get('note')!
  beforeEach(() => {
    localStorage.clear()
    useVaultStore.setState({ config: { ...DEFAULT_VAULT_CONFIG } })
  })

  it('takes the title from the text and #tags into frontmatter', async () => {
    const r = await note.parse('Kitchen ideas #home #reno', ctx)
    expect(r.values).toMatchObject({ title: 'Kitchen ideas', tags: ['home', 'reno'], body: '' })
  })

  it('writes into the notebook, naming a collision " 2", and offers Open', async () => {
    const { fs, store } = memVault({ 'Projects/Plan.md': 'old' })
    const result = await note.write(
      { title: 'Plan', notebook: 'Projects', template: '', body: 'First step', tags: ['work'] },
      { ...ctx, vaultFs: fs },
    )
    const written = store.get('Projects/Plan 2.md')!
    expect(written).toContain('title: "Plan"')
    expect(written).toContain('tags: ["work"]')
    expect(written).toContain('First step')
    expect(store.get('Projects/Plan.md')).toBe('old')
    expect(result?.message).toBe('Note created · Plan 2')
    expect(typeof result?.open).toBe('function')
  })

  it('puts the template body before what was typed', async () => {
    const { fs, store } = memVault({
      '_mentis/templates/Meeting.md': '---\ntitle: Meeting\n---\n## Agenda\n',
    })
    await note.write(
      { title: 'Sync', notebook: '', template: 'Meeting.md', body: 'Notes', tags: [] },
      { ...ctx, vaultFs: fs },
    )
    const written = store.get('Sync.md')!
    expect(written.indexOf('## Agenda')).toBeLessThan(written.indexOf('Notes'))
    expect(written).not.toContain('title: Meeting')
  })
})

describe('journal destination', () => {
  const journal = captureDestinations.get('journal')!
  beforeEach(() => {
    useVaultStore.setState({ config: { ...DEFAULT_VAULT_CONFIG } })
    useEditorStore.setState({ tabs: [] })
  })

  it('reads an explicit or natural date, else today', async () => {
    expect((await journal.parse('walked >2026-10-01', ctx)).values).toMatchObject({
      date: '2026-10-01',
      entry: 'walked',
    })
    expect((await journal.parse('slept badly yesterday', ctx)).values.date).toBe('2026-10-05')
    expect((await journal.parse('good day', ctx)).values.date).toBe('2026-10-06')
  })

  it("creates the day's note if needed and appends a timestamped entry", async () => {
    const { fs, store } = memVault()
    await journal.write({ date: '2026-10-06', entry: 'Long walk' }, { ...ctx, vaultFs: fs })
    const day = store.get('_mentis/_journals/2026-10-06.md')!
    expect(day).toMatch(/\*\*\d{2}:\d{2}\*\* — Long walk\n$/)
  })

  it('appends without a timestamp when that setting is off', async () => {
    useVaultStore.setState({ config: { ...DEFAULT_VAULT_CONFIG, journalTimestamps: false } })
    const { fs, store } = memVault({ '_mentis/_journals/2026-10-06.md': '# Tue\n' })
    await journal.write({ date: '2026-10-06', entry: 'Quiet' }, { ...ctx, vaultFs: fs })
    expect(store.get('_mentis/_journals/2026-10-06.md')).toBe('# Tue\n\nQuiet\n')
  })

  it("refuses while that day's journal is open in a tab, so the editor cannot overwrite it", async () => {
    const path = '_mentis/_journals/2026-10-06.md'
    useEditorStore.setState({
      tabs: [{ id: 't', path, type: 'markdown', title: '2026-10-06', isDirty: false }],
    })
    const { fs, store } = memVault({ [path]: 'kept' })
    await expect(
      journal.write({ date: '2026-10-06', entry: 'x' }, { ...ctx, vaultFs: fs }),
    ).rejects.toThrow(/open in a tab/)
    expect(store.get(path)).toBe('kept')
  })
})

describe('journal template and tabs', () => {
  const journal = captureDestinations.get('journal')!
  const TEMPLATE =
    '---\ndefaultTab: Work\n---\n## Morning\n\n## Work\n\nStarted {{weekday}} {{date}}\n'
  beforeEach(() => {
    useVaultStore.setState({
      config: { ...DEFAULT_VAULT_CONFIG, journalTemplate: 'Day.md', journalTimestamps: false },
    })
    useEditorStore.setState({ tabs: [] })
  })

  it("offers the template's tabs and picks its default tab", async () => {
    const { fs } = memVault({ '_mentis/templates/Day.md': TEMPLATE })
    const r = await journal.parse('Fixed the bug', { ...ctx, vaultFs: fs })
    expect(r.values).toMatchObject({ tab: 'Work', tabOptions: ['Morning', 'Work'] })
  })

  it('creates the day from the template, variables filled, and writes under the tab', async () => {
    const { fs, store } = memVault({ '_mentis/templates/Day.md': TEMPLATE })
    await journal.write(
      { date: '2026-10-06', tab: 'Work', entry: 'Fixed the bug' },
      { ...ctx, vaultFs: fs },
    )
    const day = store.get('_mentis/_journals/2026-10-06.md')!
    expect(day).toContain('tags: [daily]')
    expect(day).not.toContain('defaultTab')
    expect(day).toContain('## Morning\n\n## Work\n\nStarted Tuesday 2026-10-06\n\nFixed the bug\n')
  })

  it("adds a tab the day does not have, leaving an existing day's other text alone", async () => {
    const existing = '# Tue\n\n## Morning\n\nRan.\n'
    const { fs, store } = memVault({
      '_mentis/templates/Day.md': TEMPLATE,
      '_mentis/_journals/2026-10-06.md': existing,
    })
    await journal.write(
      { date: '2026-10-06', tab: 'Evening', entry: 'Read.' },
      { ...ctx, vaultFs: fs },
    )
    expect(store.get('_mentis/_journals/2026-10-06.md')).toBe(
      '# Tue\n\n## Morning\n\nRan.\n\n## Evening\n\nRead.\n',
    )
  })
})

describe('chat destination', () => {
  it('needs no confirmation', () => {
    expect(captureDestinations.bySigil('/chat')?.immediate).toBe(true)
  })
})
