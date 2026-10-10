import matter from 'gray-matter'
import type { FileSystemAdapter } from '@/lib/fs/types'
import { dailyNoteTitle, openOrCreateDailyNote, todayDailyNotePath } from '@/lib/notes/daily-note'
import { fillTemplate } from '@/lib/notes/template-vars'
import { DAILY_NOTES_DIR, DEFAULT_VAULT_CONFIG, type VaultConfig } from '@/types/vault'
import { journalTabs, NOTES_TAB, splitJournal, templateTabs } from './sections'

export interface JournalTemplate {
  /** The template's text after its frontmatter, variables unfilled. */
  body: string
  tabs: string[]
  /** `defaultTab` from the template's frontmatter. */
  defaultTab?: string
}

const folderOf = (config: VaultConfig) =>
  (config.dailyNotesFolder ?? DAILY_NOTES_DIR).replace(/^\/+|\/+$/g, '') || DAILY_NOTES_DIR

export function journalPath(config: VaultConfig, date: Date): string {
  return todayDailyNotePath(date, folderOf(config))
}

/** The journal template chosen in Settings, or null for none (or one that has gone). */
export async function readJournalTemplate(
  fs: FileSystemAdapter,
  config: VaultConfig,
): Promise<JournalTemplate | null> {
  if (!config.journalTemplate) return null
  const folder = config.templateFolder ?? DEFAULT_VAULT_CONFIG.templateFolder
  try {
    const { data, content } = matter(await fs.readTextFile(`${folder}/${config.journalTemplate}`))
    const defaultTab = typeof data.defaultTab === 'string' ? data.defaultTab.trim() : undefined
    return { body: content, tabs: templateTabs(content), defaultTab: defaultTab || undefined }
  } catch {
    return null
  }
}

/**
 * Open a day's journal, creating it first if needed: the date header, then
 * the journal template with its variables filled. Days that exist are never
 * changed, whatever the template now says.
 */
export async function openOrCreateJournal(
  fs: FileSystemAdapter,
  date: Date,
  config: VaultConfig,
): Promise<string> {
  const path = journalPath(config, date)
  if (await fs.exists(path)) return path
  const template = await readJournalTemplate(fs, config)
  const body = template
    ? fillTemplate(template.body.replace(/^\s+/, ''), { date, title: dailyNoteTitle(date) })
    : ''
  return openOrCreateDailyNote(fs, date, folderOf(config), body)
}

/**
 * The tab to open, or to capture into, on a day: the template's default tab
 * when the day has it (or when nothing is written yet), else the day's first.
 */
export function defaultJournalTab(dayRaw: string | null, template: JournalTemplate | null): string {
  const preferred = template?.defaultTab ?? template?.tabs[0]
  if (dayRaw === null) return preferred ?? NOTES_TAB
  const tabs = journalTabs(splitJournal(dayRaw))
  if (preferred && tabs.some((t) => t.toLowerCase() === preferred.toLowerCase())) return preferred
  return tabs[0] ?? NOTES_TAB
}
