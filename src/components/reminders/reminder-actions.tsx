'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ReminderRow } from '@/core/index/protocol'
import { SNOOZES, openReminder, type Settle } from '@/lib/reminders/actions'

export const reminderButton =
  'border-border text-fg hover:bg-bg-hover rounded-md border px-2 py-1 text-xs font-medium'

/**
 * Open, Snooze and Done for one reminder. `onSettle` writes the choice;
 * Snooze is left out where it means nothing (a reminder still to come).
 */
export function ReminderActions({
  row,
  onSettle,
  snooze = true,
}: {
  row: ReminderRow
  onSettle: (how: Settle) => void
  snooze?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className={reminderButton} onClick={() => openReminder(row)}>
        Open
      </button>
      {snooze && (
        <div className="relative">
          <button
            type="button"
            className={`${reminderButton} flex items-center gap-1`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            Snooze <ChevronDown className="size-3" aria-hidden />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="bg-bg border-border absolute right-0 z-10 mt-1 flex w-36 flex-col rounded-md border py-1 shadow-lg"
            >
              {SNOOZES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  role="menuitem"
                  className="text-fg hover:bg-bg-hover px-3 py-1.5 text-left text-xs"
                  onClick={() => {
                    setMenuOpen(false)
                    onSettle({ done: false, until: s.until(new Date()) })
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        className="bg-accent text-accent-fg hover:bg-accent/90 rounded-md px-2 py-1 text-xs font-medium"
        onClick={() => onSettle({ done: true })}
      >
        Done
      </button>
    </div>
  )
}
