import { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'

import { useVaultSession } from '@/contexts/vault-fs-context'
import { choosePick } from '@/lib/chat/choose-pick'
import { parsePickValue, pickValue } from '@/lib/chat/picks'
import { providerMeta } from '@/lib/chat/providers/meta'
import type { ChatSettings } from '@/types/chat'
import { cn } from '@/utils/cn'

interface ModelPickerProps {
  settings: ChatSettings
  disabled?: boolean
  className?: string
}

/** The models chosen in Settings, grouped by provider. Choosing one switches chat to it. */
export function ModelPicker({ settings, disabled, className }: ModelPickerProps) {
  const { vaultFs } = useVaultSession()
  const groups = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const p of settings.picks) out.set(p.provider, [...(out.get(p.provider) ?? []), p.model])
    return [...out]
  }, [settings.picks])

  if (settings.picks.length === 0) return null
  const value = settings.provider
    ? pickValue({ provider: settings.provider, model: settings.model })
    : ''

  return (
    <div className={cn('relative min-w-0', className)}>
      <select
        aria-label="Model"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const pick = parsePickValue(e.target.value)
          if (pick) void choosePick(vaultFs, pick)
        }}
        className="text-fg-secondary hover:bg-bg-hover border-border w-full max-w-full appearance-none truncate rounded-lg border bg-transparent py-1.5 pr-7 pl-2 font-sans text-xs outline-none disabled:opacity-40"
      >
        {groups.map(([provider, models]) => (
          <optgroup
            key={provider}
            label={providerMeta(provider as ChatSettings['picks'][number]['provider']).label}
          >
            {models.map((m) => (
              <option key={m} value={`${provider}|${m}`}>
                {m}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="text-fg-muted pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2" />
    </div>
  )
}
