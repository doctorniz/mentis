import { Plus } from 'lucide-react'
import { tabOptions } from '@/components/shell/tab-bar-tabs'
import { MAX_TABS, useTabBarStore } from '@/stores/tab-bar'
import { cn } from '@/utils/cn'

/** The four tabs either side of Capture, in the order they were picked. */
export default function TabBarSetting() {
  const tabs = useTabBarStore((s) => s.tabs)
  const setTabs = useTabBarStore((s) => s.setTabs)
  const options = tabOptions()
  const byKey = new Map(options.map((o) => [o.key, o]))
  const picked = tabs.flatMap((k) => byKey.get(k) ?? [])

  const preview = (slice: typeof picked) =>
    slice.map(({ key, label, icon: Icon }) => (
      <span
        key={key}
        className="text-fg-secondary flex flex-1 flex-col items-center gap-0.5 text-[11px]"
      >
        <Icon className="size-4" aria-hidden />
        {label}
      </span>
    ))

  return (
    <div className="space-y-3">
      <div
        aria-hidden
        className="border-border bg-bg flex items-center rounded-lg border px-1 py-2"
      >
        {preview(picked.slice(0, 2))}
        <span className="flex flex-1 justify-center">
          <span className="bg-accent text-accent-fg flex size-8 items-center justify-center rounded-full">
            <Plus className="size-4" />
          </span>
        </span>
        {preview(picked.slice(2))}
      </div>

      <ul className="border-border divide-border divide-y rounded-lg border">
        {options.map(({ key, label, icon: Icon }) => {
          const slot = tabs.indexOf(key)
          const on = slot >= 0
          const full = !on && tabs.length >= MAX_TABS
          return (
            <li key={key}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={full}
                onClick={() => setTabs(on ? tabs.filter((k) => k !== key) : [...tabs, key])}
                className="hover:bg-bg-hover flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm disabled:opacity-40"
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                    on ? 'bg-accent border-accent text-accent-fg' : 'border-border-strong',
                  )}
                  aria-hidden
                >
                  {on ? slot + 1 : ''}
                </span>
                <Icon className="text-fg-muted size-4 shrink-0" aria-hidden />
                <span className="flex-1">{label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
