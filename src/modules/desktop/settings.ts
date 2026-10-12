import type { SettingsSection } from '@/core/registries/settings'
import { isDesktopApp } from '@/lib/fs/platform'

/** Desktop-only settings: they belong to this machine, so they live outside the vault. */
const sections: readonly SettingsSection[] = [
  {
    id: 'desktop.capture',
    tab: 'Desktop',
    order: 70,
    title: 'Capture from anywhere',
    when: isDesktopApp,
    panel: () => import('./settings-panel'),
  },
]

export default sections
