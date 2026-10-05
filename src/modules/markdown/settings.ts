import type { SettingsSection } from '@/core/registries/settings'

const sections: readonly SettingsSection[] = [
  {
    id: 'markdown.attachments',
    tab: 'Editor',
    order: 20,
    title: 'Attachments',
    fields: [
      {
        id: 'attachmentFolder',
        kind: 'folder',
        label: 'Attachment folder',
        hint: 'Where uploaded images and videos are saved when embedded in notes.',
        get: (c) => c.attachmentFolder ?? '_assets',
        set: (_, attachmentFolder) => ({ attachmentFolder }),
      },
    ],
  },
  {
    id: 'markdown.daily-notes',
    tab: 'Editor',
    order: 22,
    title: 'Daily Notes',
    fields: [
      {
        id: 'dailyNotesEnabled',
        kind: 'toggle',
        label: "Show today's date in sidebar",
        get: (c) => c.dailyNotesEnabled !== false,
        set: (_, dailyNotesEnabled) => ({ dailyNotesEnabled }),
      },
    ],
    // The folder moves existing notes, so it changes only through its Move button.
    panel: () => import('./daily-notes-folder-setting'),
  },
]

export default sections
