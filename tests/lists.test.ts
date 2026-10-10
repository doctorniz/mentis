import { describe, expect, it } from 'vitest'
import {
  appendToList,
  applyDueReset,
  emptyList,
  listAsText,
  listTitle,
  newItem,
  parseList,
  periodStart,
  serializeList,
  type ListDoc,
} from '@/lib/lists'

const withoutIds = (doc: ListDoc) => ({
  ...doc,
  items: doc.items.map(({ id: _, ...rest }) => rest),
})

describe('list files', () => {
  it('reads items, checks and notes', () => {
    const doc = parseList(
      [
        '---',
        'type: list',
        'kind: checklist',
        '---',
        '- [ ] Milk',
        '  2 × semi-skimmed',
        '- [x] Bread',
        '',
      ].join('\n'),
    )
    expect(doc.kind).toBe('checklist')
    expect(withoutIds(doc).items).toEqual([
      { text: 'Milk', done: false, note: '2 × semi-skimmed' },
      { text: 'Bread', done: true, note: '' },
    ])
  })

  it('round-trips: what is written reads back the same', () => {
    const doc: ListDoc = {
      ...emptyList('ordered'),
      items: [newItem('Preheat oven', '200 °C\nfan off'), { ...newItem('Mix'), done: true }],
    }
    const raw = serializeList(doc)
    expect(raw).toContain('1. [ ] Preheat oven\n   200 °C\n   fan off\n2. [x] Mix')
    expect(withoutIds(parseList(raw))).toEqual(withoutIds(doc))
  })

  it('keeps frontmatter and text it does not understand', () => {
    const raw = [
      '---',
      'type: list',
      'kind: checklist',
      'colour: green',
      '---',
      'Weekly shop, Saturday.',
      '',
      '- [ ] Eggs',
      '',
      'Remember the bags.',
      '',
    ].join('\n')
    const doc = parseList(raw)
    expect(doc.extraFrontmatter).toEqual({ colour: 'green' })
    expect(doc.preamble).toBe('Weekly shop, Saturday.')
    expect(doc.trailer).toBe('Remember the bags.')
    const again = serializeList(doc)
    expect(again).toContain('colour: green')
    expect(again).toContain('Weekly shop, Saturday.')
    expect(again).toContain('Remember the bags.')
  })

  it('accepts plain bullets and numbered items without boxes as unchecked items', () => {
    const doc = parseList('- Apples\n3) Pears\n')
    expect(withoutIds(doc).items.map((i) => [i.text, i.done])).toEqual([
      ['Apples', false],
      ['Pears', false],
    ])
  })

  it('reads a lastReset written as a bare YAML date', () => {
    expect(parseList('---\nreset: daily\nlastReset: 2026-10-05\n---\n').lastReset).toBe(
      '2026-10-05',
    )
  })

  it('appends an item, keeping the rest', () => {
    const raw = appendToList('---\nkind: ordered\nnote: x\n---\n1. [x] One\n', 'Two', 'later')
    const doc = parseList(raw)
    expect(doc.kind).toBe('ordered')
    expect(doc.extraFrontmatter).toEqual({ note: 'x' })
    expect(withoutIds(doc).items.at(-1)).toEqual({ text: 'Two', done: false, note: 'later' })
  })

  it('takes its title from the file name', () => {
    expect(listTitle('_mentis/_lists/Weekly shop.list.md')).toBe('Weekly shop')
  })
})

describe('scheduled reset', () => {
  // Saturday 10 October 2026.
  const now = new Date(2026, 9, 10, 9, 0)
  const ticked = (reset: ListDoc['reset'], lastReset?: string): ListDoc => ({
    ...emptyList(),
    reset,
    lastReset,
    items: [{ ...newItem('Water plants'), done: true }],
  })

  it('finds the start of the day, the week (Monday) and the month', () => {
    expect(periodStart('daily', now)).toBe('2026-10-10')
    expect(periodStart('weekly', now)).toBe('2026-10-05')
    expect(periodStart('monthly', now)).toBe('2026-10-01')
  })

  it('unchecks everything once a new period has begun', () => {
    const reset = applyDueReset(ticked('weekly', '2026-10-04'), now)
    expect(reset?.items[0]!.done).toBe(false)
    expect(reset?.lastReset).toBe('2026-10-10')
  })

  it('does nothing within the same period', () => {
    expect(applyDueReset(ticked('weekly', '2026-10-06'), now)).toBeNull()
    expect(applyDueReset(ticked('daily', '2026-10-10'), now)).toBeNull()
  })

  it('starts counting, without unchecking, the first time', () => {
    const first = applyDueReset(ticked('monthly'), now)
    expect(first?.items[0]!.done).toBe(true)
    expect(first?.lastReset).toBe('2026-10-10')
  })

  it('never resets an ordered list or one without a schedule', () => {
    expect(applyDueReset(ticked(undefined, '2020-01-01'), now)).toBeNull()
    expect(applyDueReset({ ...ticked('daily', '2020-01-01'), kind: 'ordered' }, now)).toBeNull()
  })
})

describe('sharing as text', () => {
  it('writes boxes, numbers for ordered lists and notes after a dash', () => {
    const doc: ListDoc = {
      ...emptyList('ordered'),
      items: [{ ...newItem('Book venue', 'Hall or garden'), done: true }, newItem('Invite')],
    }
    expect(listAsText('Party', doc)).toBe('Party\n\n1. ☑ Book venue — Hall or garden\n2. ☐ Invite')
  })
})
