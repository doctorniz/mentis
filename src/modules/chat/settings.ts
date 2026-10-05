import type { SettingsSection } from '@/core/registries/settings'

const sections: readonly SettingsSection[] = [
  {
    id: 'chat.ai',
    tab: 'AI',
    order: 50,
    panel: () => import('./settings-panel'),
  },
]

export default sections
