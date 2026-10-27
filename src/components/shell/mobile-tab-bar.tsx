import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useUiStore } from '@/stores/ui'
import { useTabBarStore } from '@/stores/tab-bar'
import { views } from '@/core/registries'
import { tabOptions, type TabOption } from '@/components/shell/tab-bar-tabs'
import { cn } from '@/utils/cn'

const CaptureSheet = lazy(() => import('./capture-sheet'))

/** Whether an on-screen keyboard has taken the bottom of the screen. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const check = () => setOpen(window.innerHeight - vv.height > 150)
    vv.addEventListener('resize', check)
    return () => vv.removeEventListener('resize', check)
  }, [])
  return open
}

/**
 * The main way around on a narrow screen: Capture in the middle, and the
 * four tabs either side of it chosen in Settings › Phone. Everything else is
 * in the masthead's menu. Hidden while the keyboard is up, so it never sits
 * on top of what is being typed.
 */
export function MobileTabBar() {
  const activeView = useUiStore((s) => s.activeView)
  const chosen = useTabBarStore((s) => s.tabs)
  const keyboardOpen = useKeyboardOpen()
  const [capturing, setCapturing] = useState(false)

  const tabs = useMemo(() => {
    const byKey = new Map(tabOptions().map((t) => [t.key, t]))
    return chosen.flatMap((k) => byKey.get(k) ?? [])
  }, [chosen])
  const activeId = views.resolve(activeView)?.def.id

  const tabButton = ({ key, label, icon: Icon, views: lit, run }: TabOption) => {
    const active = activeId !== undefined && lit.includes(activeId)
    return (
      <button
        key={key}
        type="button"
        onClick={run}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
          active ? 'text-accent' : 'text-fg-secondary active:text-fg',
        )}
      >
        <Icon className="size-5" aria-hidden />
        {label}
      </button>
    )
  }

  return (
    <>
      {!keyboardOpen && (
        <nav
          aria-label="Tabs"
          data-testid="mobile-tab-bar"
          className="border-border bg-bg safe-bottom flex shrink-0 border-t md:hidden"
        >
          {tabs.slice(0, 2).map(tabButton)}
          <button
            type="button"
            onClick={() => setCapturing(true)}
            aria-label="Capture"
            className="flex min-h-14 flex-1 items-center justify-center"
          >
            <span className="bg-accent text-accent-fg flex size-11 items-center justify-center rounded-full shadow-sm">
              <Plus className="size-6" aria-hidden />
            </span>
          </button>
          {tabs.slice(2).map(tabButton)}
        </nav>
      )}
      {capturing && (
        <Suspense fallback={null}>
          <CaptureSheet onClose={() => setCapturing(false)} />
        </Suspense>
      )}
    </>
  )
}
