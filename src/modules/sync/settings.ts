import type { SettingsSection } from '@/core/registries/settings'
import { isIosApp } from '@/lib/fs/platform'

// Dropbox sign-in is not built for iOS yet, so there the Sync tab is left out.
const sections: readonly SettingsSection[] = isIosApp()
  ? []
  : [
      {
        id: 'sync.cloud',
        tab: 'Sync',
        order: 40,
        title: 'Cloud sync',
        panel: () => import('./settings-panel'),
      },
    ]

export default sections
