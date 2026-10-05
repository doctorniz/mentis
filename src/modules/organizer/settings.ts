import type { SettingsSection } from '@/core/registries/settings'

const sections: readonly SettingsSection[] = [
  {
    id: 'organizer.calendar',
    tab: 'Calendar',
    order: 60,
    panel: () => import('./calendar-settings-panel'),
  },
]

export default sections
