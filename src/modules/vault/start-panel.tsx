import { useState } from 'react'
import { START_CHOICES, getStartChoice, setStartChoice } from '@/lib/vault/start-view'
import type { StartChoice } from '@/lib/vault/start-view'

/** What this device opens to. Kept on the device, not in the vault's config. */
export default function StartPanel() {
  const [choice, setChoice] = useState<StartChoice>(getStartChoice)
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <label htmlFor="start-view" className="text-fg text-sm font-medium">
        Open to
      </label>
      <select
        id="start-view"
        value={choice}
        onChange={(e) => {
          const next = e.target.value as StartChoice
          setChoice(next)
          setStartChoice(next)
        }}
        className="border-border bg-bg-secondary text-fg focus:ring-accent/50 w-48 rounded-md border px-2.5 py-1.5 text-sm focus:ring-1 focus:outline-none"
      >
        {START_CHOICES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  )
}
