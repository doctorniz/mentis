import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { VaultFsProvider, type VaultSessionValue } from '@/contexts/vault-fs-context'
import { Toaster } from '@/components/ui/toaster'
import { CaptureBar } from '@/modules/capture/capture-bar'
import { restoreLastVault } from '@/lib/vault/session'
import { getStoredActiveVaultPath } from '@/lib/vault/session-storage'
import { useVaultStore } from '@/stores/vault'

/** Tall enough for a destination's confirmation dialog. */
const CONFIRMING_HEIGHT = 600

type Vault = VaultSessionValue | 'none' | 'loading'

/**
 * The desktop capture overlay (its own window and page, `capture.html`): the
 * capture bar alone, input only. Esc on an empty bar, a click outside, or a
 * save hides it; Ctrl/⌘+Enter saves and stays. It opens the vault the main
 * window last had open, and tells the main window what it saved so open
 * views refresh.
 */
export function CaptureOverlay() {
  const [vault, setVault] = useState<Vault>('loading')
  const [shown, setShown] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const vaultRef = useRef<Vault>(vault)
  vaultRef.current = vault

  const openVault = useCallback(async () => {
    const restored = await restoreLastVault().catch(() => null)
    if (restored?.status === 'opened') {
      useVaultStore.getState().setConfig(restored.session.config)
      useVaultStore.getState().setActiveVaultPath(restored.session.vaultPath)
      setVault(restored.session)
    } else {
      setVault('none')
    }
  }, [])

  useEffect(() => {
    void openVault()
  }, [openVault])

  // Each show: refocus, and follow the main window if it switched vaults.
  useEffect(() => {
    let unlisten: (() => void) | undefined
    void listen('overlay-shown', () => {
      setShown((n) => n + 1)
      const current = vaultRef.current
      if (typeof current !== 'object' || current.vaultPath !== getStoredActiveVaultPath()) {
        void openVault()
      }
      // Two frames: the window has painted with its content.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => void invoke('overlay_visible').catch(() => {})),
      )
    }).then((fn) => (unlisten = fn))
    void invoke('overlay_ready').catch(() => {})
    return () => unlisten?.()
  }, [openVault])

  // The window is as tall as its content, or room for a dialog.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const fit = () =>
      void invoke('overlay_set_height', {
        height: confirming ? CONFIRMING_HEIGHT : Math.ceil(el.getBoundingClientRect().height),
      }).catch(() => {})
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [confirming])

  // `>` in the bar: the command palette lives in the main window.
  useEffect(() => {
    function onOpenPalette(e: Event) {
      const query = (e as CustomEvent<{ query?: string }>).detail?.query ?? ''
      void invoke('overlay_open_main', { paletteQuery: query }).catch(() => {})
    }
    window.addEventListener('ink:open-command-palette', onOpenPalette)
    return () => window.removeEventListener('ink:open-command-palette', onOpenPalette)
  }, [])

  const hide = () => void invoke('overlay_hide').catch(() => {})

  return (
    <div ref={rootRef} className="bg-bg border-border overflow-hidden rounded-xl border shadow-xl">
      {typeof vault === 'object' ? (
        <VaultFsProvider value={vault}>
          <CaptureBar
            placement="bottom"
            focusSignal={shown}
            onEscapeEmpty={hide}
            onConfirmingChange={setConfirming}
            onSaved={(_, { destination, stay }) => {
              void emitTo('main', 'capture-saved', { destination }).catch(() => {})
              if (!stay) hide()
            }}
          />
        </VaultFsProvider>
      ) : (
        <p
          className="text-fg-muted px-4 py-3 text-sm"
          onKeyDown={(e) => e.key === 'Escape' && hide()}
        >
          {vault === 'loading' ? 'Opening your vault…' : 'Open a vault in Mentis to capture to it.'}
        </p>
      )}
      <Toaster />
    </div>
  )
}
