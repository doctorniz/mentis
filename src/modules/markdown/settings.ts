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
      {
        id: 'journalTimestamps',
        kind: 'toggle',
        label: 'Timestamp entries added from capture',
        hint: 'Each /journal entry starts with the time it was added.',
        get: (c) => c.journalTimestamps !== false,
        set: (_, journalTimestamps) => ({ journalTimestamps }),
      },
    ],
    // The folder moves existing notes, so it changes only through its Move button.
    panel: () => import('./daily-notes-folder-setting'),
  },
  {
    id: 'markdown.journal-template',
    tab: 'Editor',
    order: 23,
    panel: () => import('./journal-template-setting'),
  },
]

export default sections
