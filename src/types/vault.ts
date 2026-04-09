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
  /** Page style for newly created blank PDFs */
  pdfPageStyle: 'blank' | 'lined' | 'grid'
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
  Vault = 'vault',
  /** @deprecated use ViewMode.Vault */
  FileBrowser = 'file-browser',
  /** @deprecated use ViewMode.Vault */
  Notes = 'notes',
  Search = 'search',
  Graph = 'graph',
  New = 'new',
}

/** Sub-mode within the unified Vault view */
export type VaultLayoutMode = 'browse' | 'tree'

export interface VaultMetadata {
  path: string
  name: string
  fileCount: number
  lastOpened: string
}

export const MARROW_DIR = '_marrow'
export const INBOX_DIR = '_inbox'
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
  pdfPageStyle: 'blank',
}
