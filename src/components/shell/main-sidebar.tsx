import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import {
  Camera,
  FileStack,
  Loader2,
  LogOut,
  Mic,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Settings,
  StickyNote,
  Sun,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSync } from '@/contexts/sync-context'
import { useUiStore, type ThemeChoice } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import { useJournalStore } from '@/stores/journal'
import { useNewFileActions, type NewMenuItem } from '@/lib/notes/use-new-file-actions'
import { cn } from '@/utils/cn'
import { views } from '@/core/registries'
import { MOBILE_NAV_MEDIA_QUERY } from '@/lib/browser/breakpoints'
import { useMediaQuery } from '@/lib/browser/use-media-query'

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
]

// The tree loads after the shell: it is not part of startup.
const SidebarFiles = lazy(() => import('@/components/shell/sidebar-files'))

/** The date card at the top of the sidebar — opens today in the journal view. */
function TodayCard({ active }: { active: boolean }) {
  const config = useVaultStore((s) => s.config)
  if (config?.dailyNotesEnabled === false) return null

  const now = new Date()
  const month = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })

  return (
    <button
      type="button"
      onClick={() => useJournalStore.getState().openDay()}
      title="Open today's journal"
      aria-label={`Today, ${weekday}`}
      className={cn(
        'mb-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
        active ? 'bg-accent/10' : 'hover:bg-sidebar-hover',
      )}
    >
      <span className="border-border bg-bg flex size-9 shrink-0 flex-col items-center justify-center rounded-md border leading-none">
        <span className="text-[9px] font-semibold tracking-wide text-red-600 dark:text-red-400">
          {month}
        </span>
        <span className="text-fg text-sm font-bold">{now.getDate()}</span>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn('text-sm font-semibold', active ? 'text-accent' : 'text-fg')}>
          Today
        </span>
        <span className="text-fg-tertiary truncate text-xs">{weekday}</span>
      </span>
    </button>
  )
}

export function MainSidebar({
  onCloseVault,
  onOpenSettings,
}: {
  onCloseVault: () => void
  onOpenSettings: () => void
}) {
  const activeView = useUiStore((s) => s.activeView)
  const activeHighlight = views.resolve(activeView)?.highlight
  const setActiveView = useUiStore((s) => s.setActiveView)
  const isOpen = useUiStore((s) => s.isSidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const sidebarWidth = useUiStore((s) => s.sidebarWidth)
  const config = useVaultStore((s) => s.config)
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const sync = useSync()
  // The sidebar is hidden on a phone; the tree opens in the vault view there.
  const showFiles = !useMediaQuery(MOBILE_NAV_MEDIA_QUERY)

  const [newOpen, setNewOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const closeNew = () => setNewOpen(false)
  const {
    fileTypeMenuItems,
    createThought,
    importFiles,
    busy: newBusy,
  } = useNewFileActions(closeNew)

  // Ctrl+N global shortcut
  useEffect(() => {
    function handler() {
      setNewOpen((o) => !o)
    }
    window.addEventListener('ink:open-new-popover', handler)
    return () => window.removeEventListener('ink:open-new-popover', handler)
  }, [])

  // File types come from their modules (createNew.menu.order); the rest are
  // app actions slotted between them by the same order numbers.
  const NEW_ITEMS: NewMenuItem[] = [
    ...fileTypeMenuItems,
    {
      label: 'Thought',
      icon: StickyNote,
      accent: 'text-yellow-500',
      order: 20,
      action: () => void createThought(),
    },
    {
      label: 'Recording',
      icon: Mic,
      accent: 'text-red-500',
      order: 60,
      action: () => {
        useUiStore.getState().setActiveView('board')
        setTimeout(() => window.dispatchEvent(new CustomEvent('ink:board-start-recording')), 100)
        closeNew()
      },
    },
    {
      label: 'Photo',
      icon: Camera,
      accent: 'text-sky-500',
      order: 70,
      action: () => photoInputRef.current?.click(),
    },
    {
      label: 'File',
      icon: Upload,
      accent: 'text-emerald-500',
      order: 80,
      action: () => fileInputRef.current?.click(),
    },
  ].sort((a, b) => a.order - b.order)

  const syncProvider = useVaultStore((s) => s.config?.sync?.provider)
  const showSync = syncProvider === 'dropbox'
  const syncing = sync?.status === 'syncing'
  const canClickSync = Boolean(sync?.canManualSync && !syncing)

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
      {/* Header — vault name + sync button */}
      <div className="border-border flex items-center gap-2 border-b px-3 py-3">
        <div className="bg-accent-light text-accent flex size-9 shrink-0 items-center justify-center rounded-lg">
          <FileStack className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate text-sm font-semibold">Mentis</p>
          <p className="text-fg-tertiary truncate text-xs">{config?.name ?? 'Vault'}</p>
        </div>

        {showSync && (
          <button
            type="button"
            onClick={() => sync?.triggerFullSync()}
            disabled={!canClickSync}
            className="text-fg-tertiary hover:text-fg hover:bg-sidebar-hover flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
            aria-label="Sync now with Dropbox"
            title={
              sync?.canManualSync
                ? 'Sync now with Dropbox'
                : 'Connect Dropbox in Settings → Sync to enable sync'
            }
          >
            {syncing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
          </button>
        )}

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

      <div className="flex shrink-0 flex-col gap-0.5 p-2 pb-0">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => useUiStore.getState().requestVaultSearch()}
            aria-label="Search vault"
            title="Search (Ctrl+F)"
            className="border-border bg-bg text-fg-tertiary hover:text-fg-secondary flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate">Search</span>
            <kbd className="hidden font-mono text-[10px] sm:inline">⌃F</kbd>
          </button>
          <button
            type="button"
            onClick={() => setNewOpen((o) => !o)}
            aria-expanded={newOpen}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
              newOpen ? 'bg-accent/10 text-accent' : 'bg-accent text-white hover:opacity-90',
            )}
          >
            <Plus
              className={cn('size-4 shrink-0 transition-transform', newOpen && 'rotate-45')}
              aria-hidden
            />
            New
          </button>
        </div>

        {newOpen && (
          <div className="flex flex-col gap-0.5 py-1">
            {NEW_ITEMS.map(({ label, icon: Icon, accent, action }) => (
              <button
                key={label}
                type="button"
                disabled={newBusy}
                onClick={action}
                className="text-fg-secondary hover:bg-sidebar-hover hover:text-fg flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors disabled:opacity-40"
              >
                <Icon className={cn('size-4 shrink-0', accent)} aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="flex shrink-0 flex-col gap-0.5 p-2" aria-label="Main views">
        <TodayCard active={activeView === 'journal'} />
        {views.nav().map(({ id, label, icon: Icon, shortcut }) => {
          const active = activeHighlight === id

          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                active
                  ? 'bg-accent/10 text-accent'
                  : 'text-fg-secondary hover:bg-sidebar-hover hover:text-fg',
              )}
            >
              <Icon className="size-5 shrink-0 opacity-90" aria-hidden />
              <span className="flex-1 truncate">{label}</span>
              {shortcut && (
                <kbd className="text-fg-muted hidden font-mono text-[10px] sm:inline">
                  ⌃{shortcut}
                </kbd>
              )}
            </button>
          )
        })}

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files)
            e.currentTarget.value = ''
          }}
        />
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files)
            e.currentTarget.value = ''
          }}
        />
      </nav>

      <div className="border-border flex min-h-0 flex-1 flex-col border-t">
        {showFiles && (
          <Suspense fallback={null}>
            <SidebarFiles />
          </Suspense>
        )}
      </div>

      <div className="border-border flex shrink-0 items-center gap-1 border-t p-2">
        <div
          className="bg-bg-tertiary flex flex-1 rounded-lg p-0.5"
          role="radiogroup"
          aria-label="Theme"
        >
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
          className="text-fg-secondary hover:text-fg size-8 shrink-0 p-0"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <Settings className="size-4" />
        </Button>
        <Button
          variant="ghost"
          className="text-fg-secondary hover:text-fg size-8 shrink-0 p-0"
          onClick={onCloseVault}
          aria-label="Close vault"
          title="Close vault"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </aside>
  )
}
