import type { SettingsSection } from '@/core/registries/settings'

const sections: readonly SettingsSection[] = [
  {
    id: 'board.thoughts-folder',
    tab: 'Editor',
    order: 21,
    title: 'Thoughts',
    // The folder moves existing thoughts, so it changes only through its Move button.
    panel: () => import('./thoughts-folder-setting'),
  },
]

export default sections
