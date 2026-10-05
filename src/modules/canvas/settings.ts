import type { SettingsSection } from '@/core/registries/settings'

const sections: readonly SettingsSection[] = [
  {
    id: 'canvas.maintenance',
    tab: 'Vault',
    order: 18,
    title: 'Maintenance',
    fields: [
      {
        id: 'drawingCleanup',
        kind: 'action',
        label: 'Drawing data',
        hint: 'Removes pixel files left behind by deleted canvases and layers.',
        button: 'Clean up',
        busyButton: 'Cleaning…',
        run: async ({ vaultFs }) => (await import('./cleanup')).cleanUpDrawingData(vaultFs),
      },
    ],
  },
]

export default sections
