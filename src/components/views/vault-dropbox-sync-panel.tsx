'use client'

import { useCallback, useEffect, useState } from 'react'
import { Cloud, CloudOff, Loader2 } from 'lucide-react'
import { useVaultStore } from '@/stores/vault'
import type { VaultConfig, VaultSyncConfig } from '@/types/vault'
import { getToken, clearToken } from '@/lib/sync/token-store'
import { stashDropboxOAuthSession } from '@/lib/sync/oauth-session'

const DEFAULT_SYNC: VaultSyncConfig = {
  provider: null,
  remotePath: '',
  pollIntervalMs: 30_000,
}

const INPUT_CLS =
  'border-border bg-bg-secondary text-fg rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50 w-48'

function NumberInput({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          if (!isNaN(n)) onChange(n)
        }}
        className="border-border bg-bg-secondary text-fg w-20 rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50"
      />
      {suffix && <span className="text-fg-muted text-xs">{suffix}</span>}
    </div>
  )
}

function mergeFullConfig(vaultConfig: VaultConfig, sync: VaultSyncConfig): VaultConfig {
  return { ...vaultConfig, sync }
}

/**
 * Dropbox sync controls for the **active vault** only (`activeVaultPath` token key).
 * Used from Settings → Sync and from Vault view → Sync tab.
 */
export function VaultDropboxSyncPanel({
  vaultConfig,
  setSync,
  saveFullConfig,
  persistSyncFieldsToDisk,
}: {
  vaultConfig: VaultConfig
  setSync: (sync: VaultSyncConfig) => void
  /** OAuth connect (must run before redirect) */
  saveFullConfig: (full: VaultConfig) => Promise<void>
  /** When true, poll interval / remote path writes also call `saveFullConfig` (live vault toolbar). */
  persistSyncFieldsToDisk: boolean
}) {
  const activeVaultPath = useVaultStore((s) => s.activeVaultPath)
  const sync = vaultConfig.sync ?? DEFAULT_SYNC
  const [syncing, setSyncing] = useState(false)
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)

  useEffect(() => {
    if (sync.provider !== 'dropbox' || !activeVaultPath) {
      setIsConnected(false)
      return
    }
    setIsConnected(null)
    getToken('dropbox', activeVaultPath)
      .then((token) => setIsConnected(token !== null))
      .catch(() => setIsConnected(false))
  }, [sync.provider, activeVaultPath])

  const patchSync = useCallback(
    (patch: Partial<VaultSyncConfig>) => {
      const next = { ...sync, ...patch }
      setSync(next)
      if (persistSyncFieldsToDisk) {
        void saveFullConfig(mergeFullConfig(vaultConfig, next))
      }
    },
    [sync, setSync, vaultConfig, saveFullConfig, persistSyncFieldsToDisk],
  )

  const handleConnectDropbox = useCallback(async () => {
    setConnectError(null)
    setSyncing(true)
    try {
      const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID ?? ''
      if (!clientId) {
        alert('Dropbox client ID is not configured. Set NEXT_PUBLIC_DROPBOX_CLIENT_ID.')
        return
      }
      if (!activeVaultPath) {
        alert('No active vault path. Close Settings and reopen the vault, then try again.')
        return
      }
      const remoteRoot =
        sync.remotePath?.trim() || `/Apps/Mentis/${vaultConfig.name.replace(/\/+$/, '')}`
      const nextSync: VaultSyncConfig = {
        provider: 'dropbox',
        remotePath: remoteRoot,
        pollIntervalMs: sync.pollIntervalMs,
      }
      const updatedConfig = mergeFullConfig(vaultConfig, nextSync)
      await saveFullConfig(updatedConfig)
      setSync(nextSync)
      stashDropboxOAuthSession({ vaultId: activeVaultPath, remoteRoot })
      const { DropboxProvider } = await import('@/lib/sync/providers/dropbox')
      const dbx = new DropboxProvider({ clientId, vaultId: activeVaultPath, remoteRoot })
      window.location.href = dbx.getAuthUrl(`${window.location.origin}/auth/dropbox`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'Failed to fetch' || msg.includes('Failed to fetch')) {
        setConnectError('Could not reach Dropbox. Check your network and try again.')
      } else {
        setConnectError(msg)
      }
    } finally {
      setSyncing(false)
    }
  }, [sync, vaultConfig, activeVaultPath, saveFullConfig, setSync])

  const handleDisconnect = useCallback(async () => {
    if (activeVaultPath) {
      await clearToken('dropbox', activeVaultPath).catch(() => {})
    }
    setIsConnected(false)
    const nextSync: VaultSyncConfig = {
      ...sync,
      provider: null,
      lastSyncedAt: undefined,
    }
    setSync(nextSync)
    await saveFullConfig(mergeFullConfig(vaultConfig, nextSync))
  }, [activeVaultPath, sync, vaultConfig, setSync, saveFullConfig])

  return (
    <div>
      <div className="divide-border divide-y">
        <div className="flex items-start justify-between gap-4 py-3">
          <p className="text-fg text-sm font-medium">Remote folder</p>
          <input
            value={sync.remotePath}
            onChange={(e) => patchSync({ remotePath: e.target.value })}
            className={INPUT_CLS}
            placeholder={`/Apps/Mentis/${vaultConfig.name}`}
            disabled={isConnected === true}
          />
        </div>

        <div className="flex items-start justify-between gap-4 py-3">
          <p className="text-fg text-sm font-medium">Poll interval</p>
          <NumberInput
            value={Math.round(sync.pollIntervalMs / 1000)}
            min={10}
            max={600}
            suffix="seconds"
            onChange={(v) => patchSync({ pollIntervalMs: v * 1000 })}
          />
        </div>

        {sync.lastSyncedAt && (
          <div className="flex items-start justify-between gap-4 py-3">
            <p className="text-fg text-sm font-medium">Last synced</p>
            <span className="text-fg-muted text-sm">
              {new Date(sync.lastSyncedAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {isConnected === null ? (
            <Loader2 className="text-fg-muted size-3.5 animate-spin" />
          ) : isConnected ? (
            <span className="size-2 rounded-full bg-green-500" />
          ) : (
            <span className="bg-fg-muted/40 size-2 rounded-full" />
          )}
          <span className="text-fg-secondary text-sm">
            {isConnected === null
              ? 'Checking…'
              : isConnected
                ? 'Connected to Dropbox'
                : 'Not connected'}
          </span>
        </div>
        {connectError && (
          <p className="text-destructive text-xs leading-snug">{connectError}</p>
        )}

        <div className="flex flex-col items-start gap-2">
          {isConnected ? (
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              className="border-border text-fg-secondary hover:text-fg flex items-center gap-1.5 rounded-lg border px-4 py-1.5 text-sm transition-colors"
            >
              <CloudOff className="size-3.5" />
              Disconnect Dropbox
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleConnectDropbox()}
              disabled={syncing || isConnected === null}
              className="bg-accent text-accent-fg hover:bg-accent/90 flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Cloud className="size-3.5" />
              )}
              Connect Dropbox
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
