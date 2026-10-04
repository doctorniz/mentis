'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  ChevronDown,
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
  Settings,
  StickyNote,
  Sun,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSync } from '@/contexts/sync-context'
import { useUiStore, type ThemeChoice } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { DAILY_NOTES_DIR } from '@/types/vault'
import { openOrCreateDailyNote } from '@/lib/notes/daily-note'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { useNewFileActions, type NewMenuItem } from '@/lib/notes/use-new-file-actions'
import { cn } from '@/utils/cn'
import { views, HOME_VIEW } from '@/core/registries'

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
]

/** Sidebar date pill — opens (or creates) today's daily note on click. */
function DailyNoteDate() {
  const { vaultFs } = useVaultSession()
  const setActiveView = useUiStore((s) => s.setActiveView)
  const config = useVaultStore((s) => s.config)
  const [busy, setBusy] = useState(false)

  const folder = config?.dailyNotesFolder ?? DAILY_NOTES_DIR
  const enabled = config?.dailyNotesEnabled !== false

  if (!enabled) return null

  const now = new Date()
  const label = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  async function handleClick() {
    if (busy) return
    setBusy(true)
    try {
      const path = await openOrCreateDailyNote(vaultFs, now, folder)
      const { detectEditorTabType, titleFromVaultPath } =
        await import('@/lib/notes/editor-tab-from-path')
      const type = await detectEditorTabType(vaultFs, path)
      useFileTreeStore.getState().setSelectedPath(path)
      useEditorStore.getState().addRecentFile(path)
      useEditorStore.getState().openTab({
        id: crypto.randomUUID(),
        path,
        type,
        title: titleFromVaultPath(path),
        isDirty: false,
      })
      setActiveView(HOME_VIEW)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy}
      title="Open today's daily note"
      className={cn(
        'w-full rounded-lg px-3 py-2 text-center transition-colors',
        'text-fg-secondary hover:bg-sidebar-hover hover:text-fg',
        busy && 'opacity-60',
      )}
    >
      <span className="block truncate text-sm font-medium">{label}</span>
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

      <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Main views">
        <DailyNoteDate />
        {views.nav().map(({ id, label, icon: Icon, nav }) => {
          const shortcut = nav?.shortcut
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

        {/* New — inline expand */}
        <button
          type="button"
          onClick={() => setNewOpen((o) => !o)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
            newOpen
              ? 'bg-accent/10 text-accent'
              : 'text-fg-secondary hover:bg-sidebar-hover hover:text-fg',
          )}
        >
          <Plus
            className={cn(
              'size-5 shrink-0 opacity-90 transition-transform',
              newOpen && 'rotate-45',
            )}
            aria-hidden
          />
          <span className="flex-1 truncate">New</span>
          <ChevronDown
            className={cn('size-3.5 shrink-0 transition-transform', newOpen && 'rotate-180')}
            aria-hidden
          />
        </button>

        {newOpen && (
          <div className="flex flex-col gap-0.5 pl-3">
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
      </nav>

      <div className="border-border mt-auto border-t p-2">
        <div
          className="bg-bg-tertiary mb-1 flex rounded-lg p-0.5"
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
