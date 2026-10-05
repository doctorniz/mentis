import type { SettingsSection } from '@/core/registries/settings'
import type { VaultConfig } from '@/types/vault'

/** Auto-save and version history are read only by the PDF viewer, so they are labelled as PDF settings. */
const sections: readonly SettingsSection[] = [
  {
    id: 'pdf.pages',
    tab: 'Vault',
    order: 12,
    title: 'PDF',
    fields: [
      {
        id: 'pdfPageStyle',
        kind: 'select',
        label: 'Blank page style',
        hint: 'Used when you add or insert a blank page in a PDF.',
        options: [
          { value: 'blank', label: 'Blank' },
          { value: 'lined', label: 'Lined' },
          { value: 'grid', label: 'Grid' },
        ],
        get: (c) => c.pdfPageStyle ?? 'blank',
        set: (_, v) => ({ pdfPageStyle: v as VaultConfig['pdfPageStyle'] }),
      },
    ],
  },
  {
    id: 'pdf.auto-save',
    tab: 'Editor',
    order: 24,
    title: 'PDF auto-save',
    fields: [
      {
        id: 'autoSaveEnabled',
        kind: 'toggle',
        label: 'Enable auto-save',
        get: (c) => c.autoSave.enabled,
        set: (c, enabled) => ({ autoSave: { ...c.autoSave, enabled } }),
      },
      {
        id: 'autoSaveInterval',
        kind: 'number',
        label: 'Save interval',
        min: 5,
        max: 3600,
        suffix: 'seconds',
        visible: (c) => c.autoSave.enabled,
        get: (c) => Math.round(c.autoSave.intervalMs / 1000),
        set: (c, s) => ({ autoSave: { ...c.autoSave, intervalMs: s * 1000 } }),
      },
      {
        id: 'autoSaveOnBlur',
        kind: 'toggle',
        label: 'Save on focus loss',
        visible: (c) => c.autoSave.enabled,
        get: (c) => c.autoSave.saveOnBlur,
        set: (c, saveOnBlur) => ({ autoSave: { ...c.autoSave, saveOnBlur } }),
      },
    ],
  },
  {
    id: 'pdf.version-history',
    tab: 'Snapshots',
    order: 30,
    title: 'PDF version history',
    description: 'A snapshot of a PDF is kept the first time you edit it in a session.',
    fields: [
      {
        id: 'snapshotsEnabled',
        kind: 'toggle',
        label: 'Enable version history',
        get: (c) => c.snapshots.enabled,
        set: (c, enabled) => ({ snapshots: { ...c.snapshots, enabled } }),
      },
      {
        id: 'snapshotsMaxPerFile',
        kind: 'number',
        label: 'Max snapshots per file',
        min: 1,
        max: 100,
        visible: (c) => c.snapshots.enabled,
        get: (c) => c.snapshots.maxPerFile,
        set: (c, maxPerFile) => ({ snapshots: { ...c.snapshots, maxPerFile } }),
      },
      {
        id: 'snapshotsRetention',
        kind: 'number',
        label: 'Retention period',
        min: 1,
        max: 365,
        suffix: 'days',
        visible: (c) => c.snapshots.enabled,
        get: (c) => c.snapshots.retentionDays,
        set: (c, retentionDays) => ({ snapshots: { ...c.snapshots, retentionDays } }),
      },
    ],
  },
]

export default sections
