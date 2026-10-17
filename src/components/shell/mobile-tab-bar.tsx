import { useEffect, useState } from 'react'
import { MoreHorizontal, Search, type LucideIcon } from 'lucide-react'
import { useUiStore } from '@/stores/ui'
import { views } from '@/core/registries'
import { cn } from '@/utils/cn'

/** Opens the app menu sheet (the masthead's), from the More tab. */
export const OPEN_MAIN_MENU_EVENT = 'ink:open-main-menu'

/** The views on the bar, by id: their names and icons come from the view registry. */
const VIEW_TABS = ['vault', 'board', 'organizer'] as const

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
 * The main way around on a narrow screen: Vault, Capture, Organizer, Search
 * and More (the menu sheet, for everything else). Hidden while the keyboard
 * is up, so it never sits on top of what is being typed.
 */
export function MobileTabBar() {
  const activeView = useUiStore((s) => s.activeView)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const highlight = views.resolve(activeView)?.highlight
  const keyboardOpen = useKeyboardOpen()

  const tabs: { key: string; label: string; icon: LucideIcon; active: boolean; run: () => void }[] =
    [
      ...VIEW_TABS.flatMap((id) => {
        const def = views.get(id)
        if (!def) return []
        return [
          {
            key: id,
            label: def.label,
            icon: def.icon as LucideIcon,
            active: highlight === id,
            run: () => setActiveView(id),
          },
        ]
      }),
      {
        key: 'search',
        label: 'Search',
        icon: Search,
        active: false,
        run: () => useUiStore.getState().requestVaultSearch(),
      },
      {
        key: 'more',
        label: 'More',
        icon: MoreHorizontal,
        active: false,
        run: () => window.dispatchEvent(new CustomEvent(OPEN_MAIN_MENU_EVENT)),
      },
    ]

  if (keyboardOpen) return null

  return (
    <nav
      aria-label="Tabs"
      data-testid="mobile-tab-bar"
      className="border-border bg-bg safe-bottom flex shrink-0 border-t md:hidden"
    >
      {tabs.map(({ key, label, icon: Icon, active, run }) => (
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
      ))}
    </nav>
  )
}
