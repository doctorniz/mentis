'use client'

import { useEffect, useState } from 'react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { openSearchIndex } from '@/lib/search/index'
import { reconcileSoon, reconcileVaultSearchIndex } from '@/lib/search/build-vault-index'
import { isTauri } from '@/lib/fs/platform'

function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 500 })
    } else {
      window.setTimeout(resolve, 0)
    }
  })
}

/**
 * Opens the vault's saved search index — search works from it immediately —
 * then, once the first render is done, reconciles it against the vault in the
 * background. Nothing walks or parses the vault before the app is on screen.
 *
 * In the desktop app it then watches the folder, so changes made by other
 * programs reach the tree and the index without a restart.
 */
export function VaultSearchBootstrap() {
  const { vaultFs, vaultPath } = useVaultSession()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let stopWatching: (() => void) | null = null
    setError(null)
    void (async () => {
      try {
        const { persisted } = await openSearchIndex(vaultPath)
        await whenIdle()
        if (cancelled) return
        const result = await reconcileVaultSearchIndex(vaultFs, () => cancelled)
        if (cancelled) return
        window.dispatchEvent(
          new CustomEvent('ink:search-index-reconciled', { detail: { ...result, persisted } }),
        )
        if (isTauri()) {
          const { watchDesktopVault } = await import('@/lib/vault/watch')
          const stop = await watchDesktopVault(vaultPath, () => {
            window.dispatchEvent(new CustomEvent('ink:vault-changed'))
            reconcileSoon(vaultFs)
          })
          if (cancelled) stop?.()
          else stopWatching = stop
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Search index failed')
        }
      }
    })()
    return () => {
      cancelled = true
      stopWatching?.()
    }
  }, [vaultFs, vaultPath])

  if (!error) return null

  return (
    <div
      className="text-danger bg-bg border-border-strong shrink-0 border-b px-3 py-1.5 text-center text-xs"
      role="status"
    >
      Search index: {error}
    </div>
  )
}
