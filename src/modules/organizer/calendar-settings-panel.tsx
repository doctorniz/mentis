import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import type { SettingsPanelProps } from '@/core/registries/settings'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { calendarDir } from '@/lib/calendar/folder'
// Moving a folder of one-note-per-item files is the same for events as for thoughts.
import { moveThoughtsFolder } from '@/lib/board/move-folder'
import { BUTTON_CLS, INPUT_CLS, Row, SectionHeader } from '@/components/settings/fields'
import { CALENDAR_DIR } from '@/types/vault'
import { toast } from '@/stores/toast'

/**
 * The Calendar section of the settings dialog. The folder changes only through
 * Move, so a half-typed path never becomes a destination. External sync is not built yet.
 */
export default function CalendarSettingsPanel({ config, saveNow }: SettingsPanelProps) {
  const { vaultFs } = useVaultSession()
  const current = calendarDir(config)
  const [value, setValue] = useState(current)
  const [moving, setMoving] = useState(false)

  useEffect(() => setValue(current), [current])

  const next = value.trim().replace(/^\/+|\/+$/g, '')
  const canMove = !moving && next !== '' && next !== current

  async function move() {
    setMoving(true)
    try {
      await moveThoughtsFolder(vaultFs, current, next)
      await saveNow({ ...config, calendarFolder: next })
      window.dispatchEvent(new CustomEvent('ink:vault-changed'))
      toast.success(`Calendar folder is now ${next}`)
    } catch (err) {
      console.error('Moving the calendar failed:', err)
      toast.error(
        err instanceof Error
          ? `Could not move the calendar: ${err.message}`
          : 'Could not move the calendar',
      )
    } finally {
      setMoving(false)
    }
  }

  return (
    <div>
      <div className="divide-border mb-4 divide-y">
        <Row
          label="Calendar folder"
          hint="Move to an empty or new folder. Every note in it is an event."
        >
          <div className="flex items-center gap-1.5">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canMove) void move()
              }}
              placeholder={CALENDAR_DIR}
              aria-label="Calendar folder"
              className={INPUT_CLS}
            />
            <button
              type="button"
              disabled={!canMove}
              onClick={() => void move()}
              className={BUTTON_CLS}
            >
              {moving ? 'Moving…' : 'Move'}
            </button>
          </div>
        </Row>
      </div>
      <SectionHeader>Calendar sync</SectionHeader>
      <p className="text-fg-secondary mb-4 text-xs leading-relaxed">
        External sync options are coming soon.
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
