'use client'

import { useEffect } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useSync } from '@/contexts/sync-context'
import { FileBrowserView } from '@/components/views/file-browser-view'
import { NotesView } from '@/components/views/notes-view'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import type { VaultLayoutMode } from '@/types/vault'
import { cn } from '@/utils/cn'

const MODES: { mode: VaultLayoutMode; label: string; ariaLabel: string }[] = [
  { mode: 'tree', label: 'Preview', ariaLabel: 'Preview — file tree and editor' },
  { mode: 'browse', label: 'Files', ariaLabel: 'Files — browse vault in grid or list' },
]

export function VaultView() {
  const activeVaultPath = useVaultStore((s) => s.activeVaultPath)
  const syncProvider = useVaultStore((s) => s.config?.sync?.provider)
  const vaultMode = useUiStore((s) => s.vaultMode)
  const setVaultMode = useUiStore((s) => s.setVaultMode)
  const hydrateVaultLayoutForActiveVault = useUiStore((s) => s.hydrateVaultLayoutForActiveVault)
  const sync = useSync()

  useEffect(() => {
    hydrateVaultLayoutForActiveVault()
  }, [activeVaultPath, hydrateVaultLayoutForActiveVault])

  const showSyncNow = syncProvider === 'dropbox'
  const syncing = sync?.status === 'syncing'
  const canClickSync = Boolean(sync?.canManualSync && !syncing)

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <div
          className="bg-bg-tertiary flex rounded-lg p-0.5"
          role="tablist"
          aria-label="Vault layout"
        >
          {MODES.map(({ mode, label, ariaLabel }) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={vaultMode === mode}
              aria-label={ariaLabel}
              title={ariaLabel}
              onClick={() => setVaultMode(mode)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                vaultMode === mode
                  ? 'bg-bg text-fg shadow-sm'
                  : 'text-fg-tertiary hover:text-fg-secondary',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {showSyncNow && (
          <button
            type="button"
            onClick={() => sync?.triggerFullSync()}
            disabled={!canClickSync}
            className="text-fg-tertiary hover:text-fg border-border bg-bg-tertiary hover:bg-bg disabled:opacity-50 flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors"
            aria-label="Sync now with Dropbox"
            title={
              sync?.canManualSync
                ? 'Sync now with Dropbox'
                : 'Connect Dropbox in Settings → Sync to enable sync'
            }
          >
            {syncing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {vaultMode === 'browse' ? <FileBrowserView /> : <NotesView />}
      </div>
    </div>
  )
}
