'use client'

import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { MainSidebar } from '@/components/shell/main-sidebar'
import { MobileNavMasthead } from '@/components/shell/mobile-nav-masthead'
import { markShellReady } from '@/lib/startup-mark'
import { ViewRouter } from '@/components/shell/view-router'
import { VaultSearchBootstrap } from '@/components/search/vault-search-bootstrap'
import { KeyboardShortcutsDialog } from '@/components/shell/keyboard-shortcuts-dialog'
import { useUiStore } from '@/stores/ui'
import { useEditorStore } from '@/stores/editor'
import { usePdfStore } from '@/stores/pdf'
import { useCanvasStore } from '@/stores/canvas'
import { views, HOME_VIEW } from '@/core/registries'
import { currentCommandContexts, type CommandScopes } from '@/core/registries/commands'

// Settings are loaded the first time they are opened, and stay mounted after.
const SettingsDialog = lazy(() =>
  import('@/components/shell/settings-dialog').then((m) => ({ default: m.SettingsDialog })),
)
const CommandPalette = lazy(() =>
  import('@/components/shell/command-palette').then((m) => ({ default: m.CommandPalette })),
)

export function AppShell({ onCloseVault }: { onCloseVault: () => void }) {
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
      {paletteMounted && (
        <Suspense fallback={null}>
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            contexts={paletteContexts}
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
