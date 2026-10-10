import type { SettingsSection } from '@/core/registries/settings'
import { isTauri } from '@/lib/fs/platform'

/** Desktop-only settings: they belong to this machine, so they live outside the vault. */
const sections: readonly SettingsSection[] = [
  {
    id: 'desktop.capture',
    tab: 'Desktop',
    order: 70,
    title: 'Capture from anywhere',
    when: isTauri,
    panel: () => import('./settings-panel'),
  },
]

export default sections
