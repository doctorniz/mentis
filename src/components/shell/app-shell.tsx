'use client'

import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { MainSidebar } from '@/components/shell/main-sidebar'
import { MobileNavMasthead } from '@/components/shell/mobile-nav-masthead'
import { markShellReady } from '@/lib/startup-mark'
import { ViewRouter } from '@/components/shell/view-router'
import { VaultSearchBootstrap } from '@/components/search/vault-search-bootstrap'
import { KeyboardShortcutsDialog } from '@/components/shell/keyboard-shortcuts-dialog'
import { useUiStore } from '@/stores/ui'
import { toast } from '@/stores/toast'
import type { DesktopSettings } from '@/modules/desktop/shell'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { isTauri } from '@/lib/fs/platform'
import type { FileSystemAdapter } from '@/lib/fs/types'
import { useEditorStore } from '@/stores/editor'
import { usePdfStore } from '@/stores/pdf'
import { useCanvasStore } from '@/stores/canvas'
import { views, HOME_VIEW } from '@/core/registries'
import { currentCommandContexts, type CommandScopes } from '@/core/registries/commands'

// Settings are loaded the first time they are opened, and stay mounted after.
const SettingsDialog = lazy(() =>
  import('@/components/shell/settings-dialog').then((m) => ({ default: m.SettingsDialog })),
)
let desktopChecked = false

/**
 * Once per launch: the desktop settings decide whether to ask about launch
 * at login (first launch), or to say that another app holds the hotkey.
 */
async function checkDesktopOnce(): Promise<DesktopSettings | null> {
  if (desktopChecked) return null
  desktopChecked = true
  try {
    const { getDesktopSettings } = await import('@/modules/desktop/shell')
    const settings = await getDesktopSettings()
    if (settings.loginPromptAnswered && !settings.hotkey.registered) {
      toast.warning(
        `${settings.hotkey.label} is already used by another app, so the capture hotkey is off. ` +
          'Choose another in Settings › Desktop, or use New capture in the tray menu.',
        12_000,
      )
    }
    return settings.loginPromptAnswered ? null : settings
  } catch {
    return null
  }
}

const LoginPrompt = lazy(() => import('@/components/shell/login-prompt'))

/** Reload the store a capture from the overlay window wrote into, so open views show it. */
async function refreshAfterCapture(vaultFs: FileSystemAdapter, destination?: string) {
  switch (destination) {
    case 'thought':
      await (await import('@/stores/board')).useBoardStore.getState().loadBoard(vaultFs)
      break
    case 'task':
      await (await import('@/stores/tasks')).useTasksStore.getState().loadTasks(vaultFs)
      break
    case 'calendar':
      await (await import('@/stores/calendar')).useCalendarStore.getState().loadEvents(vaultFs)
      break
    case 'bookmark':
      await (await import('@/stores/bookmarks')).useBookmarksStore.getState().loadBookmarks(vaultFs)
      break
    case 'list':
      await (await import('@/stores/lists')).useListsStore.getState().loadLists(vaultFs)
      break
  }
  window.dispatchEvent(new CustomEvent('ink:vault-changed'))
}

const CommandPalette = lazy(() =>
  import('@/components/shell/command-palette').then((m) => ({ default: m.CommandPalette })),
)

export function AppShell({ onCloseVault }: { onCloseVault: () => void }) {
  const { vaultFs } = useVaultSession()
  const setActiveView = useUiStore((s) => s.setActiveView)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState('vault')
  const [settingsMounted, setSettingsMounted] = useState(false)
  if (settingsOpen && !settingsMounted) setSettingsMounted(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteContexts, setPaletteContexts] = useState<Partial<CommandScopes>>({})
  const [paletteMounted, setPaletteMounted] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  /** The first-launch question about launch at login, when it is still unanswered. */
  const [loginPrompt, setLoginPrompt] = useState<DesktopSettings | null>(null)
  if (paletteOpen && !paletteMounted) setPaletteMounted(true)

  const paletteShell = useMemo(
    () => ({
      openSettings: (tab = 'vault') => {
        setSettingsInitialTab(tab)
        setSettingsOpen(true)
      },
      openShortcuts: () => setShortcutsOpen(true),
      closeVault: onCloseVault,
    }),
    [onCloseVault],
  )

  useEffect(() => {
    void markShellReady()
  }, [])

  // `>` typed first in a capture bar opens the palette with what follows it.
  useEffect(() => {
    function onOpenPalette(e: Event) {
      setPaletteQuery((e as CustomEvent<{ query?: string }>).detail?.query ?? '')
      setPaletteContexts({})
      setPaletteOpen(true)
    }
    window.addEventListener('ink:open-command-palette', onOpenPalette)
    return () => window.removeEventListener('ink:open-command-palette', onOpenPalette)
  }, [])

  // Desktop: the capture overlay is another window. Refresh what it saved
  // into, and open the palette when its bar hands over a `>` command.
  useEffect(() => {
    if (!isTauri()) return
    let stop = false
    const unlisten: Array<() => void> = []
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const offSaved = await listen<{ destination?: string }>('capture-saved', (e) => {
        void refreshAfterCapture(vaultFs, e.payload.destination)
      })
      const offPalette = await listen<string>('open-command-palette', (e) => {
        window.dispatchEvent(
          new CustomEvent('ink:open-command-palette', { detail: { query: e.payload ?? '' } }),
        )
      })
      if (stop) {
        offSaved()
        offPalette()
      } else unlisten.push(offSaved, offPalette)
    })
    void checkDesktopOnce().then((s) => s && setLoginPrompt(s))
    return () => {
      stop = true
      unlisten.forEach((off) => off())
    }
  }, [vaultFs])

  useEffect(() => {
    function onOpenAiSettings() {
      setSettingsInitialTab('ai')
      setSettingsOpen(true)
    }
    window.addEventListener('ink:open-settings-ai', onOpenAiSettings)
    return () => window.removeEventListener('ink:open-settings-ai', onOpenAiSettings)
  }, [])

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const hasDirtyTabs = useEditorStore.getState().tabs.some((t) => t.isDirty)
      const hasDirtyPdf = usePdfStore.getState().hasUnsavedChanges
      const hasDirtyCanvas = useCanvasStore.getState().hasUnsavedChanges
      if (hasDirtyTabs || hasDirtyPdf || hasDirtyCanvas) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // An editor surface already claimed this key (e.g. in-note find on
      // Ctrl+F) — don't hijack it for a global action too.
      if (e.defaultPrevented) return

      const mod = e.metaKey || e.ctrlKey

      if (mod && e.shiftKey && e.key === '?') {
        e.preventDefault()
        setShortcutsOpen((o) => !o)
        return
      }

      if (!mod) return

      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        // Capture what the palette can act on (a focused editor) before it takes focus.
        setPaletteContexts(currentCommandContexts())
        setPaletteQuery('')
        setPaletteOpen((o) => !o)
        return
      }
      if (e.key === '\\') {
        e.preventDefault()
        toggleSidebar()
        return
      }
      if (e.key === ',') {
        e.preventDefault()
        setSettingsInitialTab('vault')
        setSettingsOpen((o) => !o)
        return
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('ink:open-new-popover'))
        return
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        // Navigate to Vault view and open the left-column search panel
        setActiveView(HOME_VIEW)
        window.dispatchEvent(new CustomEvent('ink:vault-search-open'))
        return
      }

      const view = views.byShortcut(e.key)
      if (view) {
        e.preventDefault()
        setActiveView(view.id)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setActiveView, toggleSidebar])

  return (
    <div className="bg-bg flex h-screen w-full overflow-hidden">
      <MainSidebar
        onCloseVault={onCloseVault}
        onOpenSettings={() => {
          setSettingsInitialTab('vault')
          setSettingsOpen(true)
        }}
      />
      <main className="bg-bg-secondary flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <MobileNavMasthead
          onCloseVault={onCloseVault}
          onOpenSettings={() => {
            setSettingsInitialTab('vault')
            setSettingsOpen(true)
          }}
        />
        <VaultSearchBootstrap />
        <ViewRouter />
      </main>
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      {loginPrompt && (
        <Suspense fallback={null}>
          <LoginPrompt settings={loginPrompt} onDone={() => setLoginPrompt(null)} />
        </Suspense>
      )}
      {paletteMounted && (
        <Suspense fallback={null}>
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            contexts={paletteContexts}
            initialQuery={paletteQuery}
            shell={paletteShell}
          />
        </Suspense>
      )}
      {settingsMounted && (
        <Suspense fallback={null}>
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={(o) => {
              setSettingsOpen(o)
              if (!o) setSettingsInitialTab('vault')
            }}
            initialTab={settingsInitialTab}
          />
        </Suspense>
      )}
    </div>
  )
}
