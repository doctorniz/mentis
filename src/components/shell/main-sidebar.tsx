'use client'

import {
  FileStack,
  GitFork,
  LogOut,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Sun,
  Vault,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewFilePopover } from '@/components/shell/new-file-popover'
import { MOBILE_NAV_MEDIA_QUERY } from '@/lib/browser/breakpoints'
import { useMediaQuery } from '@/lib/browser/use-media-query'
import { useUiStore, type ThemeChoice } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import { ViewMode } from '@/types/vault'
import { cn } from '@/utils/cn'

const NAV: { mode: ViewMode; label: string; icon: typeof Vault; shortcut: string }[] = [
  { mode: ViewMode.Vault, label: 'Vault', icon: Vault, shortcut: '1' },
  { mode: ViewMode.Search, label: 'Search', icon: Search, shortcut: '2' },
  { mode: ViewMode.Graph, label: 'Graph', icon: GitFork, shortcut: '3' },
]

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export function MainSidebar({
  onCloseVault,
  onOpenSettings,
}: {
  onCloseVault: () => void
  onOpenSettings: () => void
}) {
  const activeView = useUiStore((s) => s.activeView)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const isOpen = useUiStore((s) => s.isSidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const sidebarWidth = useUiStore((s) => s.sidebarWidth)
  const config = useVaultStore((s) => s.config)
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const isMobileNav = useMediaQuery(MOBILE_NAV_MEDIA_QUERY)

  if (!isOpen) {
    return (
      <div className="border-border bg-sidebar-bg hidden h-full w-12 shrink-0 flex-col items-center border-r py-3 md:flex md:flex-col">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 p-0"
          onClick={toggleSidebar}
          aria-label="Expand sidebar"
        >
          <PanelLeft className="size-5" />
        </Button>
      </div>
    )
  }

  return (
    <aside
      className="border-border bg-sidebar-bg hidden h-full shrink-0 border-r md:flex md:flex-col"
      style={{ width: sidebarWidth }}
    >
      <div className="border-border flex items-center gap-2 border-b px-3 py-3">
        <div className="bg-accent-light text-accent flex size-9 shrink-0 items-center justify-center rounded-lg">
          <FileStack className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate text-sm font-semibold">Mentis</p>
          <p className="text-fg-tertiary truncate text-xs">{config?.name ?? 'Vault'}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 p-0"
          onClick={toggleSidebar}
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="size-5" />
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Main views">
        {NAV.map(({ mode, label, icon: Icon, shortcut }) => {
          const vaultModes = [ViewMode.Vault, ViewMode.FileBrowser, ViewMode.Notes]
          const active =
            activeView === mode ||
            (mode === ViewMode.Vault && vaultModes.includes(activeView))
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setActiveView(mode)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                active
                  ? 'bg-accent/10 text-accent'
                  : 'text-fg-secondary hover:bg-sidebar-hover hover:text-fg',
              )}
            >
              <Icon className="size-5 shrink-0 opacity-90" aria-hidden />
              <span className="flex-1 truncate">{label}</span>
              <kbd className="text-fg-muted hidden font-mono text-[10px] sm:inline">
                ⌃{shortcut}
              </kbd>
            </button>
          )
        })}

        {/* New file — opens popover, not a view */}
        <NewFilePopover enableGlobalShortcut={!isMobileNav}>
          <button
            type="button"
            className="text-fg-secondary hover:bg-sidebar-hover hover:text-fg flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
          >
            <Plus className="size-5 shrink-0 opacity-90" aria-hidden />
            <span className="flex-1 truncate">New</span>
            <kbd className="text-fg-muted hidden font-mono text-[10px] sm:inline">⌃N</kbd>
          </button>
        </NewFilePopover>
      </nav>

      <div className="border-border mt-auto border-t p-2">
        <div className="bg-bg-tertiary mb-1 flex rounded-lg p-0.5" role="radiogroup" aria-label="Theme">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              aria-label={label}
              title={label}
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors',
                theme === value
                  ? 'bg-bg text-fg shadow-sm'
                  : 'text-fg-tertiary hover:text-fg-secondary',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          className="text-fg-secondary hover:text-fg h-9 w-full justify-start gap-3 px-3"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          <Settings className="size-5 shrink-0" />
          Settings
        </Button>
        <Button
          variant="ghost"
          className="text-fg-secondary hover:text-fg h-9 w-full justify-start gap-3 px-3"
          onClick={onCloseVault}
        >
          <LogOut className="size-5 shrink-0" />
          Close vault
        </Button>
      </div>
    </aside>
  )
}
