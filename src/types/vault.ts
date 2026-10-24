import { HOME_VIEW } from '@/core/registries/views'

export interface VaultSyncConfig {
  provider: 'dropbox' | null
  /** Absolute Dropbox path for this vault, e.g. `/Apps/Mentis/MyVault` */
  remotePath: string
  /** Polling interval in ms (default 30 000) */
  pollIntervalMs: number
  lastSyncedAt?: string
  /**
   * Extra vault-relative paths sync ignores in both directions, merged
   * with the built-in defaults (`_mentis/snapshots`,
   * `_mentis/search-index.json`). A pattern matches the exact path or
   * anything under it as a folder. No Settings UI yet — edit
   * `_mentis/config.json` directly.
   */
  excludePaths?: string[]
}

export interface VaultConfig {
  name: string
  version: number
  snapshots: SnapshotConfig
  autoSave: AutoSaveConfig
  /** View id the vault opens on. Unknown ids open the home view. */
  defaultView: string
  /** Folder that holds templates (relative to vault root, no leading slash) */
  templateFolder: string
  /** Default destination folder for new notes/PDFs/drawings ('/' = root) */
  defaultNewFileFolder: string
  /**
   * Vault-relative folder where uploaded images/videos are saved when
   * embedded in notes, and where Thoughts keep their images and
   * recordings. Defaults to 'Attachments' (vault root).
   */
  attachmentFolder: string
  /** Page style for newly created blank PDFs */
  pdfPageStyle: 'blank' | 'lined' | 'grid'
  /**
   * Show today's date in the sidebar as a quick-open for the daily note.
   * Defaults to true.
   */
  dailyNotesEnabled: boolean
  /**
   * Vault-relative folder where daily notes are stored.
   * Defaults to 'Journal'. Free-form; the folder is created on first use.
   */
  dailyNotesFolder: string
  /**
   * Vault-relative folder that holds Thoughts, one note per thought.
   * Defaults to 'Thoughts'. Every note directly in it is a thought.
   */
  thoughtsFolder: string
  /** Start each journal entry added from capture with its time (`**14:32** — `). Defaults to true. */
  journalTimestamps: boolean
  /** File name of the journal template in the templates folder; '' for none. */
  journalTemplate: string
  /** Time (`HH:mm`) to prompt for the day's journal while it is unwritten; '' for off. */
  journalPrompt: string
  /** Cloud sync settings (Dropbox); self-hosted sync may be added later */
  sync?: VaultSyncConfig
  /**
   * AI / LLM chat settings. Safe-to-sync (provider id, model id, system
   * prompt). API keys are stored separately in IndexedDB, NOT in this
   * object — they should never land in the vault's `config.json`.
   */
  chat?: import('./chat').ChatSettings
  /** Starred files and folders (vault-relative paths), shown at the top of the tree. */
  starred?: string[]
}

export interface SnapshotConfig {
  enabled: boolean
  maxPerFile: number
  retentionDays: number
}

export interface AutoSaveConfig {
  enabled: boolean
  intervalMs: number
  saveOnBlur: boolean
}

/** Sub-mode within the unified Vault view (toolbar: Preview / Files) */
export type VaultLayoutMode = 'browse' | 'tree'

export interface VaultMetadata {
  path: string
  name: string
  fileCount: number
  lastOpened: string
}

export const DAILY_NOTES_DIR = 'Journal'
export const THOUGHTS_DIR = 'Thoughts'
export const MENTIS_DIR = '_mentis'
export const ASSETS_DIR = 'Attachments'
export const SIGNATURES_DIR = `${MENTIS_DIR}/signatures`
export const TEMPLATES_DIR = `${MENTIS_DIR}/templates`
export const SNAPSHOTS_DIR = `${MENTIS_DIR}/snapshots`
export const CONFIG_FILE = `${MENTIS_DIR}/config.json`
export const SEARCH_INDEX_FILE = `${MENTIS_DIR}/search-index.json`

export const DEFAULT_VAULT_CONFIG: VaultConfig = {
  name: 'My Vault',
  version: 1,
  snapshots: {
    enabled: true,
    maxPerFile: 5,
    retentionDays: 30,
  },
  autoSave: {
    enabled: true,
    intervalMs: 5_000,
    saveOnBlur: true,
  },
  defaultView: HOME_VIEW,
  templateFolder: TEMPLATES_DIR,
  defaultNewFileFolder: '/',
  attachmentFolder: ASSETS_DIR,
  pdfPageStyle: 'blank',
  dailyNotesEnabled: true,
  dailyNotesFolder: DAILY_NOTES_DIR,
  thoughtsFolder: THOUGHTS_DIR,
  journalTimestamps: true,
  journalTemplate: '',
  journalPrompt: '',
}
