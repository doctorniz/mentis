import { describe, expect, it } from 'vitest'
import {
  appendToTab,
  joinJournal,
  journalTabs,
  NOTES_TAB,
  setTabContent,
  splitJournal,
  tabContent,
  templateTabs,
} from '@/lib/journal/sections'
import { fillTemplate } from '@/lib/notes/template-vars'

const DAY = [
  '---',
  'title: Monday, October 12, 2026',
  'tags: [daily]',
  '---',
  '',
  '# Monday, October 12, 2026',
  '',
  'Woke early.',
  '',
  '## Morning',
  '',
  'Run by the river.',
  '',
  '## Work',
  '',
  '```md',
  '## not a heading',
  '```',
  '',
].join('\n')

describe('journal sections', () => {
  it('splits into Notes and ## tabs, ignoring headings inside code fences', () => {
    const doc = splitJournal(DAY)
    expect(journalTabs(doc)).toEqual([NOTES_TAB, 'Morning', 'Work'])
    expect(tabContent(doc, 'Notes')).toBe('Woke early.')
    expect(tabContent(doc, 'morning')).toBe('Run by the river.')
    expect(tabContent(doc, 'Work')).toContain('## not a heading')
  })

  it('joins back to exactly the same text', () => {
    expect(joinJournal(splitJournal(DAY))).toBe(DAY)
    const plain = '# Title\nJust text, no sections.\n'
    expect(joinJournal(splitJournal(plain))).toBe(plain)
  })

  it('shows a single Notes tab for a day without sections', () => {
    expect(journalTabs(splitJournal('---\na: 1\n---\n# Tue\n'))).toEqual([NOTES_TAB])
  })

  it('omits Notes when the day has only sections', () => {
    expect(journalTabs(splitJournal('# Tue\n\n## Morning\n\nx\n'))).toEqual(['Morning'])
  })

  it('replaces one tab and leaves the rest byte for byte', () => {
    const next = joinJournal(setTabContent(splitJournal(DAY), 'Morning', 'Swim instead.'))
    expect(next).toContain('## Morning\n\nSwim instead.\n\n## Work')
    expect(next.slice(0, next.indexOf('## Morning'))).toBe(DAY.slice(0, DAY.indexOf('## Morning')))
    expect(next.slice(next.indexOf('## Work'))).toBe(DAY.slice(DAY.indexOf('## Work')))
  })

  it('edits the Notes tab in place', () => {
    const next = joinJournal(setTabContent(splitJournal(DAY), NOTES_TAB, 'Slept in.'))
    expect(next).toContain('# Monday, October 12, 2026\n\nSlept in.\n\n## Morning')
  })

  it('adds a missing tab as a new section at the end', () => {
    const next = joinJournal(
      setTabContent(splitJournal('# Tue\n\n## Morning\n\nx\n'), 'Evening', 'Read.'),
    )
    expect(next).toBe('# Tue\n\n## Morning\n\nx\n\n## Evening\n\nRead.\n')
  })

  it('appends an entry as a new paragraph, adding the heading if needed', () => {
    const once = appendToTab(DAY, 'Morning', '**07:10** — coffee')
    expect(tabContent(splitJournal(once), 'Morning')).toBe(
      'Run by the river.\n\n**07:10** — coffee',
    )
    const added = appendToTab('# Tue\n', 'Gratitude', 'Sunshine')
    expect(added).toBe('# Tue\n\n## Gratitude\n\nSunshine\n')
  })

  it('reads a template’s tabs from its ## headings', () => {
    expect(templateTabs('---\ndefaultTab: Work\n---\n## Morning\n\n## Work\n')).toEqual([
      'Morning',
      'Work',
    ])
  })
})

describe('template variables', () => {
  const date = new Date(2026, 9, 12, 14, 5)
  it('fills date, weekday, time and title, and leaves other braces alone', () => {
    expect(
      fillTemplate('{{date}} {{ weekday }} {{time}} {{title}} {{unknown}}', {
        date,
        title: 'Plan',
      }),
    ).toBe('2026-10-12 Monday 14:05 Plan {{unknown}}')
  })
})
