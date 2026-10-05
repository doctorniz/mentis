import type { SettingsSection } from '@/core/registries/settings'

const sections: readonly SettingsSection[] = [
  {
    id: 'sync.cloud',
    tab: 'Sync',
    order: 40,
    title: 'Cloud sync',
    panel: () => import('./settings-panel'),
  },
]

export default sections
