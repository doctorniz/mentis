import { CalendarDays } from 'lucide-react'
import { SectionHeader } from '@/components/settings/fields'

/** The Calendar section of the settings dialog. External sync is not built yet. */
export default function CalendarSettingsPanel() {
  return (
    <div>
      <SectionHeader>Calendar sync</SectionHeader>
      <p className="text-fg-secondary mb-4 text-xs leading-relaxed">
        Calendar events are stored locally in your vault as markdown files (
        <code className="bg-bg-tertiary rounded px-1 font-mono text-[10px]">
          _mentis/_calendar/
        </code>
        ). External sync options are coming soon.
      </p>
      <div className="divide-border divide-y">
        {/* Google Calendar — coming soon */}
        <div className="flex items-center justify-between gap-4 py-3 opacity-40 select-none">
          <div className="flex items-center gap-3">
            <div className="bg-bg-tertiary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <CalendarDays className="text-fg-muted size-4" />
            </div>
            <div>
              <p className="text-fg text-sm font-medium">Google Calendar</p>
              <p className="text-fg-muted text-xs">Two-way sync via CalDAV / OAuth</p>
            </div>
          </div>
          <span className="border-border text-fg-muted rounded-full border px-2.5 py-0.5 text-[10px] font-medium">
            Coming soon
          </span>
        </div>

        {/* Apple Calendar — coming soon */}
        <div className="flex items-center justify-between gap-4 py-3 opacity-40 select-none">
          <div className="flex items-center gap-3">
            <div className="bg-bg-tertiary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <CalendarDays className="text-fg-muted size-4" />
            </div>
            <div>
              <p className="text-fg text-sm font-medium">Apple Calendar</p>
              <p className="text-fg-muted text-xs">Subscribe or import/export via .ics</p>
            </div>
          </div>
          <span className="border-border text-fg-muted rounded-full border px-2.5 py-0.5 text-[10px] font-medium">
            Coming soon
          </span>
        </div>

        {/* Outlook — coming soon */}
        <div className="flex items-center justify-between gap-4 py-3 opacity-40 select-none">
          <div className="flex items-center gap-3">
            <div className="bg-bg-tertiary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <CalendarDays className="text-fg-muted size-4" />
            </div>
            <div>
              <p className="text-fg text-sm font-medium">Outlook / Microsoft 365</p>
              <p className="text-fg-muted text-xs">Two-way sync via Microsoft Graph API</p>
            </div>
          </div>
          <span className="border-border text-fg-muted rounded-full border px-2.5 py-0.5 text-[10px] font-medium">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  )
}
