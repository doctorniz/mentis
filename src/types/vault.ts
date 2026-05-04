export interface VaultSyncConfig {
  provider: 'dropbox' | null
  /** Absolute Dropbox path for this vault, e.g. `/Apps/Mentis/MyVault` */
  remotePath: string
  /** Polling interval in ms (default 30 000) */
  pollIntervalMs: number
  lastSyncedAt?: string
}

export interface VaultConfig {
  name: string
  version: number
  theme: 'light' | 'dark' | 'system'
  snapshots: SnapshotConfig
  autoSave: AutoSaveConfig
  defaultView: ViewMode
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
   * Defaults to '_marrow/_dailies' (hidden from the file tree).
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

export enum ViewMode {
  /**
   * Tier-1 "whole vault" chat. Full-viewport BYO-LLM surface that can reach
   * across every note/PDF in the vault, as opposed to the per-document chat
   * panel that's scoped to the currently open file.
   */
  VaultChat = 'vault-chat',
  Vault = 'vault',
  /** @deprecated use ViewMode.Vault */
  FileBrowser = 'file-browser',
  /** @deprecated use ViewMode.Vault */
  Notes = 'notes',
  Search = 'search',
  Graph = 'graph',
  Board = 'board',
  /** @deprecated folded into ViewMode.Organizer */
  Tasks = 'tasks',
  Bookmarks = 'bookmarks',
  /** Full file browser — shows all folders including hidden system ones */
  Files = 'files',
  New = 'new',
  /** @deprecated folded into ViewMode.Organizer */
  Calendar = 'calendar',
  /** Unified organizer: Tasks, Lists, Calendars, Reminders */
  Organizer = 'organizer',
}

/** Sub-mode within the unified Vault view (toolbar: Preview / Files) */
export type VaultLayoutMode = 'browse' | 'tree'

export interface VaultMetadata {
  path: string
  name: string
  fileCount: number
  lastOpened: string
}

export const DAILY_NOTES_DIR = '_marrow/_dailies'
export const MARROW_DIR = '_marrow'
export const ASSETS_DIR = '_assets'
export const SIGNATURES_DIR = `${MARROW_DIR}/signatures`
export const TEMPLATES_DIR = `${MARROW_DIR}/templates`
export const SNAPSHOTS_DIR = `${MARROW_DIR}/snapshots`
export const CONFIG_FILE = `${MARROW_DIR}/config.json`
export const SEARCH_INDEX_FILE = `${MARROW_DIR}/search-index.json`

export const DEFAULT_VAULT_CONFIG: VaultConfig = {
  name: 'My Vault',
  version: 1,
  theme: 'system',
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
  defaultView: ViewMode.Vault,
  templateFolder: TEMPLATES_DIR,
  defaultNewFileFolder: '/',
  attachmentFolder: '_assets',
  pdfPageStyle: 'blank',
  dailyNotesEnabled: true,
  dailyNotesFolder: '_marrow/_dailies',
}
