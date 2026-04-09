'use client'

import { useEffect, useState } from 'react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { rebuildVaultSearchIndex } from '@/lib/search/build-vault-index'

/** Initializes / refreshes MiniSearch from vault contents (full rebuild). */
export function VaultSearchBootstrap() {
  const { vaultFs, vaultPath } = useVaultSession()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    void (async () => {
      try {
        await rebuildVaultSearchIndex(vaultFs)
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
