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
   * embedded in notes. Defaults to '_assets' (vault root).
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
   * Defaults to '_mentis/_journals' (hidden from the file tree).
   * Free-form; the folder is created on first use.
   */
  dailyNotesFolder: string
  /** Cloud sync settings (Dropbox); self-hosted sync may be added later */
  sync?: VaultSyncConfig
  /**
   * AI / LLM chat settings. Safe-to-sync (provider id, model id, system
   * prompt). API keys are stored separately in IndexedDB, NOT in this
   * object — they should never land in the vault's `config.json`.
   */
  chat?: import('./chat').ChatSettings
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

export const DAILY_NOTES_DIR = '_mentis/_journals'
export const MENTIS_DIR = '_mentis'
export const ASSETS_DIR = '_assets'
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
  attachmentFolder: '_assets',
  pdfPageStyle: 'blank',
  dailyNotesEnabled: true,
  dailyNotesFolder: '_mentis/_journals',
}
