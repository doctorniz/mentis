'use client'

import { useCallback, useState } from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { ErrorBoundary } from '@/components/shell/error-boundary'
import { VaultLanding } from '@/components/landing/vault-landing'
import { VaultFsProvider, type VaultSessionValue } from '@/contexts/vault-fs-context'
import { SyncProvider } from '@/contexts/sync-context'
import { useVaultStore } from '@/stores/vault'
import { useUiStore } from '@/stores/ui'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { ViewMode } from '@/types/vault'
import { setStoredActiveVaultPath } from '@/lib/vault/session-storage'
import { clearStoredDirectoryHandle } from '@/lib/fs'
import { clearSearchIndex } from '@/lib/search/index'
import { clearVaultChatSession } from '@/lib/chat/vault-chat-session'
import { useVaultChatStore } from '@/stores/vault-chat'
import { Toaster } from '@/components/ui/toaster'

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

  const handleVaultReady = useCallback((next: VaultSessionValue) => {
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
    useUiStore.getState().setActiveView(config.defaultView ?? ViewMode.Vault)

    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {})
    }
  }, [])

  const handleCloseVault = useCallback(() => {
    const path = useVaultStore.getState().activeVaultPath
    if (path) clearVaultChatSession(path)
    useVaultChatStore.getState().reset()
    setStoredActiveVaultPath(null)
    clearStoredDirectoryHandle().catch(() => {})
    setSession(null)
    clearSearchIndex()
    useVaultStore.getState().reset()
    useEditorStore.getState().closeAllTabs()
    useFileTreeStore.getState().setSelectedPath(null)
    useUiStore.getState().setActiveView(ViewMode.Vault)
  }, [])

  return (
    <>
      <Toaster />
      {!session ? (
        <VaultLanding onVaultReady={handleVaultReady} />
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
