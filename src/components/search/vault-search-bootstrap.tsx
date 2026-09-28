'use client'

import { useEffect, useState } from 'react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { openSearchIndex } from '@/lib/search/index'
import { reconcileVaultSearchIndex } from '@/lib/search/build-vault-index'

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
 */
export function VaultSearchBootstrap() {
  const { vaultFs, vaultPath } = useVaultSession()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
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
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Search index failed')
        }
      }
    })()
    return () => {
      cancelled = true
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
