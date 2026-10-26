import { useState } from 'react'
import { cn } from '@/utils/cn'

export interface ViewTab<T extends string> {
  id: T
  label: string
  /** A count shown beside the label (e.g. missed reminders); hidden when 0. */
  badge?: { count: number; label: string }
}

/** The tab a view last showed, remembered per device under `storageKey`. */
export function useRememberedTab<T extends string>(
  storageKey: string,
  tabs: readonly T[],
  fallback: T,
): [T, (tab: T) => void] {
  const [tab, setTab] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(storageKey) as T | null
      if (saved && tabs.includes(saved)) return saved
    } catch {
      /* localStorage unavailable */
    }
    return fallback
  })
  const choose = (next: T) => {
    setTab(next)
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      /* noop */
    }
  }
  return [tab, choose]
}

/** The strip of tabs at the top of Tasks and Calendar. */
export function ViewTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly ViewTab<T>[]
  active: T
  onChange: (tab: T) => void
}) {
  return (
    <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-0 border-b px-3">
      {tabs.map(({ id, label, badge }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'relative px-4 py-2.5 text-sm font-medium transition-colors pointer-coarse:py-3.5',
            active === id
              ? 'text-fg after:bg-accent after:absolute after:inset-x-0 after:bottom-0 after:h-[2px]'
              : 'text-fg-secondary hover:text-fg',
          )}
        >
          {label}
          {badge && badge.count > 0 && (
            <span
              className="bg-accent/10 text-accent ml-1.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
              aria-label={badge.label}
            >
              {badge.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
