import type { SettingsSection } from '@/core/registries/settings'

const sections: readonly SettingsSection[] = [
  {
    id: 'vault.general',
    tab: 'Vault',
    order: 10,
    title: 'General',
    fields: [
      {
        id: 'name',
        kind: 'text',
        label: 'Vault name',
        placeholder: 'My Vault',
        get: (c) => c.name,
        set: (_, name) => ({ name }),
      },
      {
        id: 'defaultNewFileFolder',
        kind: 'folder',
        label: 'Default folder for new files',
        get: (c) => c.defaultNewFileFolder,
        set: (_, defaultNewFileFolder) => ({ defaultNewFileFolder }),
      },
      {
        id: 'templateFolder',
        kind: 'folder',
        label: 'Template folder',
        get: (c) => c.templateFolder,
        set: (_, templateFolder) => ({ templateFolder }),
      },
    ],
  },
]

export default sections
