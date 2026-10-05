import { describe, expect, it } from 'vitest'
import { createSettingsRegistry, type SettingsSection } from '@/core/registries/settings'
import { settings } from '@/core/registries'
import { DEFAULT_VAULT_CONFIG } from '@/types/vault'

const section = (id: string, tab: string, order: number): SettingsSection => ({ id, tab, order })

describe('createSettingsRegistry', () => {
  it('groups sections into tabs, ordered by their first section', () => {
    const registry = createSettingsRegistry([
      section('ai', 'AI', 50),
      section('vault.b', 'Vault', 18),
      section('editor', 'Editor', 20),
      section('vault.a', 'Vault', 10),
    ])
    expect(registry.tabs().map((t) => [t.id, t.label, t.sections.map((s) => s.id)])).toEqual([
      ['vault', 'Vault', ['vault.a', 'vault.b']],
      ['editor', 'Editor', ['editor']],
      ['ai', 'AI', ['ai']],
    ])
  })

  it('refuses a section id registered twice', () => {
    expect(() =>
      createSettingsRegistry([section('x', 'Vault', 1), section('x', 'Editor', 2)]),
    ).toThrow('Settings section "x" is registered twice')
  })
})

describe('registered settings', () => {
  it('keeps the six tabs in their usual order', () => {
    expect(settings.tabs().map((t) => t.label)).toEqual([
      'Vault',
      'Editor',
      'Snapshots',
      'Sync',
      'AI',
      'Calendar',
    ])
  })

  it('reads and writes every config field through the draft, leaving the rest alone', () => {
    const config = { ...DEFAULT_VAULT_CONFIG }
    for (const tab of settings.tabs()) {
      for (const s of tab.sections) {
        for (const field of s.fields ?? []) {
          if (field.kind === 'action') continue
          const patch =
            field.kind === 'toggle'
              ? field.set(config, !field.get(config))
              : field.kind === 'number'
                ? field.set(config, field.get(config) + 1)
                : field.set(config, field.get(config))
          // A patch only names top-level config keys, and nested objects keep their siblings.
          for (const [key, value] of Object.entries(patch)) {
            expect(key in DEFAULT_VAULT_CONFIG).toBe(true)
            const before = (config as Record<string, unknown>)[key]
            if (before && typeof before === 'object') {
              expect(Object.keys(value as object).sort()).toEqual(Object.keys(before).sort())
            }
          }
        }
      }
    }
  })

  it('stores the auto-save interval in milliseconds and shows seconds', () => {
    const interval = settings
      .tabs()
      .flatMap((t) => t.sections)
      .flatMap((s) => s.fields ?? [])
      .find((f) => f.id === 'autoSaveInterval')
    if (interval?.kind !== 'number') throw new Error('no auto-save interval field')
    const config = { ...DEFAULT_VAULT_CONFIG }
    expect(interval.get(config)).toBe(config.autoSave.intervalMs / 1000)
    expect(interval.set(config, 30)).toEqual({
      autoSave: { ...config.autoSave, intervalMs: 30_000 },
    })
  })
})
