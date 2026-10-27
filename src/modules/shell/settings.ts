import type { SettingsSection } from '@/core/registries/settings'
import { MOBILE_NAV_MEDIA_QUERY } from '@/lib/browser/breakpoints'

/** Phone-only settings: they belong to this device, so they live outside the vault. */
const sections: readonly SettingsSection[] = [
  {
    id: 'shell.tab-bar',
    tab: 'Phone',
    order: 71,
    title: 'Tab bar',
    when: () =>
      typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_NAV_MEDIA_QUERY).matches,
    panel: () => import('./tab-bar-setting'),
  },
]

export default sections
