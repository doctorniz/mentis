'use client'

import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { ErrorBoundary } from '@/components/shell/error-boundary'
import { VaultLanding } from '@/components/landing/vault-landing'
import { VaultFsProvider, type VaultSessionValue } from '@/contexts/vault-fs-context'
import { SyncProvider } from '@/contexts/sync-context'
import { useVaultStore } from '@/stores/vault'
import { useUiStore } from '@/stores/ui'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { HOME_VIEW, viewIdOrHome } from '@/core/registries'
import { forgetLastVault } from '@/lib/vault/session'
import { trackPathChanges } from '@/lib/fs/track'
import { clearSearchIndex } from '@/lib/search/index'
import { clearVaultChatSession } from '@/lib/chat/vault-chat-session'
import { useVaultChatStore } from '@/stores/vault-chat'
import { Toaster } from '@/components/ui/toaster'

// Shown only when asked for from the landing page, so not part of startup.
const AboutOverlay = lazy(() =>
  import('@/components/landing/about-overlay').then((m) => ({ default: m.AboutOverlay })),
)

// Stars are not needed to draw the first screen.
const loadStars = () => import('@/lib/vault/starred')

function SyncProviderBridge({
  session,
  children,
}: {
  session: VaultSessionValue
  children: React.ReactNode
}) {
  const syncConfig = useVaultStore((s) => s.config?.sync)
  const vaultLabel = useVaultStore((s) => s.config?.name ?? 'My Vault')
  return (
    <SyncProvider
      vaultFs={session.vaultFs}
      vaultId={session.vaultPath}
      vaultLabel={vaultLabel}
      syncConfig={syncConfig}
    >
      {children}
    </SyncProvider>
  )
}

export function AppRoot() {
  const [session, setSession] = useState<VaultSessionValue | null>(null)
  const [showAbout, setShowAbout] = useState(false)

  const handleVaultReady = useCallback((opened: VaultSessionValue) => {
    // Every rename and delete made in the app passes through here, so stars follow.
    const next = {
      ...opened,
      vaultFs: trackPathChanges(opened.vaultFs, {
        onRename: (from, to) => void loadStars().then((m) => m.moveStars(from, to)),
        onRemove: (path) => void loadStars().then((m) => m.moveStars(path, null)),
      }),
    }
    setSession(next)
    const { vaultPath, config } = next
    const store = useVaultStore.getState()
    store.setActiveVaultPath(vaultPath)
    store.setConfig(config)
    store.setOpen(true)
    store.setError(null)
    store.addRecentVault({
      path: vaultPath,
      name: config.name,
      fileCount: 0,
      lastOpened: new Date().toISOString(),
    })
    useUiStore.getState().setActiveView(viewIdOrHome(config.defaultView))

    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!session) return
    let stop: (() => void) | undefined
    let closed = false
    void loadStars().then((m) => {
      if (!closed) stop = m.startStarredSync(session.vaultFs, session.vaultPath)
    })
    return () => {
      closed = true
      stop?.()
    }
  }, [session])

  // Clear expired PDF snapshots once per open, after startup has settled.
  useEffect(() => {
    if (!session) return
    const timer = window.setTimeout(() => {
      const snapshots = useVaultStore.getState().config?.snapshots
      if (!snapshots) return
      import('@/lib/snapshot')
        .then((m) => m.pruneSnapshots(session.vaultFs, snapshots))
        .catch(() => {})
    }, 10_000)
    return () => window.clearTimeout(timer)
  }, [session])

  // Empty sync trash folders older than a month, once per open.
  useEffect(() => {
    if (!session) return
    const timer = window.setTimeout(() => {
      import('@/lib/sync/trash').then((m) => m.pruneLocalTrash(session.vaultFs)).catch(() => {})
    }, 10_000)
    return () => window.clearTimeout(timer)
  }, [session])

  const handleCloseVault = useCallback(() => {
    const path = useVaultStore.getState().activeVaultPath
    if (path) clearVaultChatSession(path)
    useVaultChatStore.getState().reset()
    void forgetLastVault()
    setSession(null)
    clearSearchIndex()
    useVaultStore.getState().reset()
    useEditorStore.getState().closeAllTabs()
    useFileTreeStore.getState().setSelectedPath(null)
    useUiStore.getState().setActiveView(HOME_VIEW)
  }, [])

  return (
    <>
      <Toaster />
      {!session ? (
        showAbout ? (
          <Suspense fallback={null}>
            <AboutOverlay onBack={() => setShowAbout(false)} />
          </Suspense>
        ) : (
          <VaultLanding onVaultReady={handleVaultReady} onShowAbout={() => setShowAbout(true)} />
        )
      ) : (
        <ErrorBoundary>
          <VaultFsProvider value={session}>
            <SyncProviderBridge session={session}>
              <AppShell onCloseVault={handleCloseVault} />
            </SyncProviderBridge>
          </VaultFsProvider>
        </ErrorBoundary>
      )}
    </>
  )
}
