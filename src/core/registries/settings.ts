import type { ComponentType } from 'react'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { VaultConfig } from '@/types/vault'

/**
 * Settings registry.
 *
 * Every section of the settings dialog is contributed by a module from
 * `src/modules/<name>/settings.ts`. A section is either a list of fields the
 * dialog renders itself, or a lazily loaded panel for settings that need
 * their own UI (AI providers, Dropbox), or both. Tabs are whatever `tab`
 * names the sections use, ordered by their first section.
 *
 * Fields read and write the vault config through `get` and `set`; the dialog
 * keeps a draft and saves it, so a module never touches `config.json` itself.
 */

export type ConfigPatch = Partial<VaultConfig>

interface FieldBase {
  id: string
  label: string
  hint?: string
  /** Hide the field unless this holds for the current draft. */
  visible?: (config: VaultConfig) => boolean
}

export type SettingsField =
  | (FieldBase & {
      kind: 'toggle'
      get: (config: VaultConfig) => boolean
      set: (config: VaultConfig, value: boolean) => ConfigPatch
    })
  | (FieldBase & {
      kind: 'number'
      get: (config: VaultConfig) => number
      set: (config: VaultConfig, value: number) => ConfigPatch
      min?: number
      max?: number
      suffix?: string
    })
  | (FieldBase & {
      kind: 'text'
      get: (config: VaultConfig) => string
      set: (config: VaultConfig, value: string) => ConfigPatch
      placeholder?: string
    })
  | (FieldBase & {
      kind: 'select'
      get: (config: VaultConfig) => string
      set: (config: VaultConfig, value: string) => ConfigPatch
      options: readonly { value: string; label: string }[]
    })
  | (FieldBase & {
      kind: 'folder'
      get: (config: VaultConfig) => string
      set: (config: VaultConfig, value: string) => ConfigPatch
    })
  | (FieldBase & {
      /** A button that does something now rather than changing the config. */
      kind: 'action'
      button: string
      busyButton: string
      run: (ctx: { vaultFs: FileSystemAdapter }) => Promise<void>
    })

export interface SettingsPanelProps {
  /** The draft being edited. */
  config: VaultConfig
  /** Change the draft; it is saved shortly after. */
  update: (patch: ConfigPatch) => void
  /** Save this config now, skipping the delay (before leaving the page, after moving files). */
  saveNow: (config: VaultConfig) => Promise<void>
  vaultId: string
}

export interface SettingsSection {
  /** Unique across all modules. */
  id: string
  /** Tab label. Its id is the label in lower case (`'AI'` → `'ai'`). */
  tab: string
  /** Position among all sections; tabs follow their first section. */
  order: number
  title?: string
  description?: string
  fields?: readonly SettingsField[]
  /** Rendered after `fields`. Loaded when its tab is first shown. */
  panel?: () => Promise<{ default: ComponentType<SettingsPanelProps> }>
}

export interface SettingsTab {
  id: string
  label: string
  sections: readonly SettingsSection[]
}

export interface SettingsRegistry {
  tabs(): readonly SettingsTab[]
}

export const settingsTabId = (label: string) => label.toLowerCase()

export function createSettingsRegistry(sections: readonly SettingsSection[]): SettingsRegistry {
  const seen = new Set<string>()
  for (const s of sections) {
    if (seen.has(s.id)) throw new Error(`Settings section "${s.id}" is registered twice`)
    seen.add(s.id)
  }

  const byTab = new Map<string, SettingsSection[]>()
  for (const s of [...sections].sort((a, b) => a.order - b.order)) {
    const list = byTab.get(s.tab) ?? []
    list.push(s)
    byTab.set(s.tab, list)
  }
  // Map keeps insertion order, and sections were inserted lowest order first.
  const tabs: SettingsTab[] = [...byTab].map(([label, list]) => ({
    id: settingsTabId(label),
    label,
    sections: list,
  }))

  return { tabs: () => tabs }
}
