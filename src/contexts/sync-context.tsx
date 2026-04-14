'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { SyncStatus } from '@/lib/sync/types'
import type { SyncManager } from '@/lib/sync/sync-manager'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { VaultSyncConfig } from '@/types/vault'

interface SyncContextValue {
  status: SyncStatus
  statusMessage: string | null
  pushFile: (path: string) => void
  triggerFullSync: () => void
  /** `SyncManager` is running (authenticated); manual sync does something. */
  canManualSync: boolean
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function SyncProvider({
  vaultFs,
  vaultId,
  vaultLabel,
  syncConfig,
  children,
}: {
  vaultFs: FileSystemAdapter
  /** Stable vault key for IndexedDB tokens (e.g. OPFS scoped path or `fsapi:…`). */
  vaultId: string
  /** Display name for building the default remote path (`/Apps/Mentis/<name>` in Dropbox). */
  vaultLabel: string
  syncConfig: VaultSyncConfig | undefined
  children: ReactNode
}) {
  const managerRef = useRef<SyncManager | null>(null)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [canManualSync, setCanManualSync] = useState(false)
  const prevStatusRef = useRef<SyncStatus>('idle')

  useEffect(() => {
    setCanManualSync(false)
    if (syncConfig?.provider !== 'dropbox') {
      managerRef.current?.stopPolling()
      managerRef.current = null
      setStatus('idle')
      setStatusMessage(null)
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const { DropboxProvider } = await import('@/lib/sync/providers/dropbox')
        const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID ?? ''
        const provider = new DropboxProvider({
          clientId,
          vaultId,
          remoteRoot:
            syncConfig.remotePath || `/Apps/Mentis/${vaultLabel.replace(/\/+$/, '')}`,
        })

        const authenticated = await provider.isAuthenticated()
        if (!authenticated || cancelled) return

        const { SyncManager } = await import('@/lib/sync/sync-manager')
        const mgr = new SyncManager(
          provider,
          vaultFs,
          vaultId,
          syncConfig.pollIntervalMs,
        )

        mgr.onStatusChange((s, msg) => {
          if (!cancelled) {
            // After any syncing → idle transition, local FS may have changed
            if (s === 'idle' && prevStatusRef.current === 'syncing') {
              window.dispatchEvent(new CustomEvent('ink:vault-changed'))
            }
            prevStatusRef.current = s
            setStatus(s)
            setStatusMessage(msg ?? null)
          }
        })

        managerRef.current = mgr
        if (!cancelled) setCanManualSync(true)

        await mgr.fullSync()
        mgr.startPolling()
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setStatusMessage(err instanceof Error ? err.message : String(err))
          setCanManualSync(managerRef.current !== null)
        }
      }
    })()

    return () => {
      cancelled = true
      managerRef.current?.stopPolling()
      managerRef.current = null
      setCanManualSync(false)
      prevStatusRef.current = 'idle'
    }
  }, [syncConfig?.provider, syncConfig?.remotePath, syncConfig?.pollIntervalMs, vaultFs, vaultId, vaultLabel])

  const pushFile = useCallback((path: string) => {
    managerRef.current?.pushFile(path).catch(() => {
      // fire-and-forget; status listener handles error display
    })
  }, [])

  const triggerFullSync = useCallback(() => {
    const mgr = managerRef.current
    if (!mgr) return
    setStatus('syncing')
    setStatusMessage(null)
    mgr.fullSync().catch(() => {
      // `SyncManager` reports failure via `onStatusChange`
    })
  }, [])

  return (
    <SyncContext.Provider
      value={{ status, statusMessage, pushFile, triggerFullSync, canManualSync }}
    >
      {children}
    </SyncContext.Provider>
  )
}

export function useSyncPush(): (path: string) => void {
  const ctx = useContext(SyncContext)
  return ctx?.pushFile ?? noop
}

export function useSync(): SyncContextValue | null {
  return useContext(SyncContext)
}

function noop() {}
