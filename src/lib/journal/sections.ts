/**
 * A day's journal as tabs. The file stays one plain note:
 *
 *     ---              ┐
 *     title: …         │ head: frontmatter and the `# Date` title, kept as is
 *     ---              │
 *     # Monday, …      ┘
 *     Before any ##    ← "Notes": the implicit first tab
 *     ## Morning       ┐
 *     …                │ one tab per `##` heading
 *     ## Work          │
 *     …                ┘
 *
 * Splitting and joining keep every byte of what is not changed, and `##`
 * lines inside code fences are not headings.
 */

export const NOTES_TAB = 'Notes'

export interface JournalSection {
  heading: string
  /** Everything after the heading line, up to the next `##` heading. */
  content: string
}

export interface JournalDoc {
  head: string
  /** Text between the head and the first `##` heading. */
  notes: string
  sections: JournalSection[]
}

const FENCE_RE = /^\s*(```|~~~)/
const SECTION_RE = /^##\s+(.+?)\s*#*\s*$/

/** Length of the frontmatter block (`---` … `---` and its line break), or 0. */
function frontmatterLength(raw: string): number {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(raw)
  return m ? m[0].length : 0
}

export function splitJournal(raw: string): JournalDoc {
  let at = frontmatterLength(raw)
  // The date title: the first non-blank line, if it is a `# ` heading.
  const titleMatch = /^(\s*\r?\n)*# [^\n]*(\r?\n|$)/.exec(raw.slice(at))
  if (titleMatch) at += titleMatch[0].length
  const head = raw.slice(0, at)

  const rest = raw.slice(at)
  const lines = rest.split(/(?<=\n)/)
  const sections: JournalSection[] = []
  let notes = ''
  let inFence = false
  for (const line of lines) {
    const text = line.replace(/\r?\n$/, '')
    if (FENCE_RE.test(text)) inFence = !inFence
    const heading = !inFence && SECTION_RE.exec(text)
    if (heading) {
      sections.push({ heading: heading[1]!, content: '' })
    } else if (sections.length) {
      sections[sections.length - 1]!.content += line
    } else {
      notes += line
    }
  }
  return { head, notes, sections }
}

export function joinJournal(doc: JournalDoc): string {
  return doc.head + doc.notes + doc.sections.map((s) => `## ${s.heading}\n${s.content}`).join('')
}

/** The tabs a day shows: Notes when it has text or nothing else, then each `##` section. */
export function journalTabs(doc: JournalDoc): string[] {
  const tabs = doc.sections.map((s) => s.heading)
  return doc.notes.trim() || tabs.length === 0 ? [NOTES_TAB, ...tabs] : tabs
}

const sameTab = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** A tab's markdown, without the blank lines around it. */
export function tabContent(doc: JournalDoc, tab: string): string {
  if (sameTab(tab, NOTES_TAB) && !doc.sections.some((s) => sameTab(s.heading, NOTES_TAB))) {
    return doc.notes.trim()
  }
  return doc.sections.find((s) => sameTab(s.heading, tab))?.content.trim() ?? ''
}

/** Content stored after a heading: a blank line, the text, and a blank line before what follows. */
function framed(markdown: string, isLast: boolean): string {
  const body = markdown.trim()
  if (!body) return isLast ? '\n' : '\n\n'
  return `\n${body}\n${isLast ? '' : '\n'}`
}

/**
 * Replace one tab's markdown, keeping everything else byte for byte. A tab
 * the day does not have yet is added at the end as a new `##` section.
 */
export function setTabContent(doc: JournalDoc, tab: string, markdown: string): JournalDoc {
  const hasNotesSection = doc.sections.some((s) => sameTab(s.heading, NOTES_TAB))
  if (sameTab(tab, NOTES_TAB) && !hasNotesSection) {
    const body = markdown.trim()
    // A line break to end the title if the file had none, a blank line, the text, a blank line before the sections.
    const lead = doc.head && !doc.head.endsWith('\n') ? '\n' : ''
    const gap = doc.sections.length ? '\n' : ''
    return { ...doc, notes: body ? `${lead}\n${body}\n${gap}` : `${lead}${gap}` }
  }
  const i = doc.sections.findIndex((s) => sameTab(s.heading, tab))
  const sections = [...doc.sections]
  if (i === -1) {
    // A new section after the last: make sure what was last ends with a blank line.
    const last = sections.at(-1)
    if (last && !last.content.endsWith('\n\n')) {
      sections[sections.length - 1] = {
        ...last,
        content: `${last.content.replace(/\n*$/, '')}\n\n`,
      }
    }
    let notes = doc.notes
    if (!last && notes.trim() && !notes.endsWith('\n\n')) notes = `${notes.replace(/\n*$/, '')}\n\n`
    // The first section under a bare title: a blank line between them.
    if (!last && !notes.trim() && doc.head) notes = doc.head.endsWith('\n') ? '\n' : '\n\n'
    sections.push({ heading: tab.trim(), content: framed(markdown, true) })
    return { ...doc, notes, sections }
  }
  sections[i] = { ...sections[i]!, content: framed(markdown, i === sections.length - 1) }
  return { ...doc, sections }
}

/** Add an entry as a new paragraph at the end of a tab, adding the tab if it is missing. */
export function appendToTab(raw: string, tab: string, entry: string): string {
  const doc = splitJournal(raw)
  const current = tabContent(doc, tab)
  const next = current ? `${current}\n\n${entry.trim()}` : entry.trim()
  return joinJournal(setTabContent(doc, tab, next))
}

/** A template's tabs: its `##` headings, in order. */
export function templateTabs(templateBody: string): string[] {
  return splitJournal(templateBody).sections.map((s) => s.heading)
}
