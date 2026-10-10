import { BookOpen, FilePlus } from 'lucide-react'
import type { CaptureDestination, ParseResult } from '@/core/registries/capture'
import { CaptureText, extractExplicitDate, extractTags } from '@/core/capture/parse'
import { extractNaturalDate, preloadDates } from '@/core/capture/dates'
import { HOME_VIEW } from '@/core/registries/views'
import { uniqueVaultPath } from '@/lib/fs/unique-path'
import { formatLocalDate } from '@/lib/tasks/recurrence'
import { useEditorStore } from '@/stores/editor'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import { DEFAULT_VAULT_CONFIG } from '@/types/vault'
import type { FileSystemAdapter } from '@/lib/fs/types'

const LAST_NOTEBOOK_KEY = 'mentis:capture-last-notebook'

function lastNotebook(): string | null {
  try {
    return localStorage.getItem(LAST_NOTEBOOK_KEY)
  } catch {
    return null
  }
}

function rememberNotebook(folder: string) {
  try {
    localStorage.setItem(LAST_NOTEBOOK_KEY, folder)
  } catch {
    /* a convenience only */
  }
}

const config = () => useVaultStore.getState().config ?? DEFAULT_VAULT_CONFIG
const trimSlashes = (p: string) => p.replace(/^\/+|\/+$/g, '')

/** A title made safe as a file name: no path separators or reserved characters. */
const fileStem = (title: string) =>
  title
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

function openInVault(path: string) {
  useEditorStore.getState().setPendingVaultOpenPath(path)
  useUiStore.getState().setVaultMode('tree')
  useUiStore.getState().setActiveView(HOME_VIEW)
}

function parseNoteInput(input: string): ParseResult {
  const text = new CaptureText(input)
  const tags = extractTags(text)
  const [first = '', ...rest] = text.residual().split('\n')
  const notebook = lastNotebook() ?? trimSlashes(config().defaultNewFileFolder ?? '')
  return {
    values: { title: first.trim(), notebook, template: '', body: rest.join('\n').trim(), tags },
    matchedSpans: text.spans,
    residual: text.residual(),
  }
}

/**
 * A note in a notebook (a folder; the vault root is "Unfiled"). The title is
 * the first line of what was typed, `#tags` go into frontmatter. A name
 * already taken gets " 2", " 3", … After saving it offers Open.
 */
const note: CaptureDestination = {
  id: 'note',
  sigil: '/note',
  aliases: ['/n'],
  label: 'Note',
  icon: FilePlus,
  hint: 'Kitchen renovation ideas #home',
  immediate: false,
  residualField: 'title',
  parseNow: parseNoteInput,
  async parse(input, { vaultFs }) {
    const parsed = parseNoteInput(input)
    const { listTemplates } = await import('@/lib/notes/template-store')
    const templates = await listTemplates(vaultFs, config().templateFolder)
    parsed.values.templateOptions = [
      { value: '', label: 'None' },
      ...templates.map((t) => ({ value: t.filename, label: t.name })),
    ]
    return parsed
  },
  fields: (values) => [
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'notebook', label: 'Notebook', kind: 'folder' },
    {
      key: 'template',
      label: 'Template',
      kind: 'select',
      options: (values.templateOptions as { value: string; label: string }[]) ?? [
        { value: '', label: 'None' },
      ],
    },
    { key: 'body', label: 'Body', kind: 'textarea' },
    { key: 'tags', label: 'Tags', kind: 'tags' },
  ],
  validate: (v) => (fileStem(String(v.title ?? '')) ? null : 'Title is required'),
  async write(v, { vaultFs }) {
    const title = String(v.title ?? '').trim()
    const stem = fileStem(title)
    if (!stem) return null
    const folder = trimSlashes(String(v.notebook ?? ''))
    if (folder && !(await vaultFs.exists(folder))) await vaultFs.mkdir(folder)
    const path = await uniqueVaultPath(
      vaultFs,
      folder ? `${folder}/${stem}.md` : `${stem}.md`,
      '.md',
    )

    let templateBody = ''
    if (v.template) {
      const [{ readTemplate }, { parseNote }] = await Promise.all([
        import('@/lib/notes/template-store'),
        import('@/lib/markdown'),
      ])
      const raw = await readTemplate(vaultFs, String(v.template), config().templateFolder)
      const { fillTemplate } = await import('@/lib/notes/template-vars')
      templateBody = fillTemplate(parseNote(String(v.template), raw).content, {
        date: new Date(),
        title,
      }).trim()
    }
    const tags = Array.isArray(v.tags) ? (v.tags as string[]) : []
    const body = String(v.body ?? '').trim()
    const content = [
      '---',
      `title: ${JSON.stringify(title)}`,
      `created: ${new Date().toISOString()}`,
      ...(tags.length ? [`tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`] : []),
      '---',
      '',
      ...[templateBody, body].filter(Boolean).flatMap((part) => [part, '']),
    ].join('\n')

    await vaultFs.writeTextFile(path, content)
    rememberNotebook(folder)
    window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    const name = path.split('/').pop()!.replace(/\.md$/i, '')
    return { message: `Note created · ${name}`, open: () => openInVault(path) }
  },
}

/** The tabs to offer for a day, and the one to pick: the template's and the day's own. */
async function journalTabsFor(vaultFs: FileSystemAdapter, date: string) {
  try {
    const [{ readJournalTemplate, journalPath, defaultJournalTab }, sections] = await Promise.all([
      import('@/lib/journal'),
      import('@/lib/journal/sections'),
    ])
    const template = await readJournalTemplate(vaultFs, config())
    const path = journalPath(config(), dayFrom(date))
    const raw = (await vaultFs.exists(path)) ? await vaultFs.readTextFile(path) : null
    const dayTabs = raw === null ? [] : sections.journalTabs(sections.splitJournal(raw))
    const tabs = [...new Set([...(template?.tabs ?? []), ...dayTabs])]
    return {
      tab: defaultJournalTab(raw, template),
      tabs: tabs.length ? tabs : [sections.NOTES_TAB],
    }
  } catch {
    return { tab: 'Notes', tabs: ['Notes'] }
  }
}

function dayFrom(date: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

async function parseJournalInput(
  input: string,
  now: Date,
  vaultFs: FileSystemAdapter,
): Promise<ParseResult> {
  const text = new CaptureText(input)
  let date = extractExplicitDate(text, now, 'date')
  if (!date) {
    date = (await extractNaturalDate(text, { time: false, range: false }, 'date', now))?.date
  }
  const day = date ?? formatLocalDate(now)
  const { tab, tabs } = await journalTabsFor(vaultFs, day)
  return {
    values: { date: day, tab, tabOptions: tabs, entry: text.residual() },
    matchedSpans: text.spans,
    residual: text.residual(),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * An entry appended to a tab of a day's journal, creating the day from the
 * journal template first if needed, and the tab's heading if the day lacks
 * it. Entries start with the time they were added unless that setting is
 * off. A journal open in a tab is not written behind the editor's back.
 */
const journal: CaptureDestination = {
  id: 'journal',
  sigil: '/journal',
  aliases: ['/j', '/daily'],
  label: 'Journal',
  icon: BookOpen,
  hint: 'Long walk by the river, felt clear-headed',
  immediate: false,
  residualField: 'entry',
  preload: preloadDates,
  parseNow: () => ({ values: {}, matchedSpans: [], residual: '' }),
  parse: (input, { now, vaultFs }) => parseJournalInput(input, now, vaultFs),
  fields: (values) => [
    { key: 'date', label: 'Date', kind: 'date', required: true },
    {
      key: 'tab',
      label: 'Tab',
      kind: 'combobox',
      required: true,
      emptyLabel: 'Notes',
      // A name the day does not have yet adds it as a new section.
      options: async () => (values.tabOptions as string[] | undefined) ?? ['Notes'],
    },
    { key: 'entry', label: 'Entry', kind: 'textarea', required: true },
  ],
  async write(v, { vaultFs }) {
    const entry = String(v.entry ?? '').trim()
    if (!entry) return null
    const day = dayFrom(String(v.date))
    const tab = String(v.tab ?? '').trim() || 'Notes'
    const [{ openOrCreateJournal, journalPath }, { appendToTab }] = await Promise.all([
      import('@/lib/journal'),
      import('@/lib/journal/sections'),
    ])
    const path = journalPath(config(), day)
    if (useEditorStore.getState().tabs.some((t) => t.path === path)) {
      throw new Error(
        `The journal for ${v.date} is open in a tab. Add the entry there, or close it first.`,
      )
    }
    await openOrCreateJournal(vaultFs, day, config())
    const now = new Date()
    const stamp =
      config().journalTimestamps !== false
        ? `**${pad(now.getHours())}:${pad(now.getMinutes())}** — `
        : ''
    const raw = await vaultFs.readTextFile(path)
    await vaultFs.writeTextFile(path, appendToTab(raw, tab, `${stamp}${entry}`))
    window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    return { message: `Added to Journal · ${v.date} · ${tab}` }
  },
}

export default [note, journal]
