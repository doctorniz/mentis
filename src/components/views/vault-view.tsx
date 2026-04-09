'use client'

import { useUiStore } from '@/stores/ui'
import type { VaultLayoutMode } from '@/types/vault'
import { FileBrowserView } from '@/components/views/file-browser-view'
import { NotesView } from '@/components/views/notes-view'
import { cn } from '@/utils/cn'

const MODES: { mode: VaultLayoutMode; emoji: string; ariaLabel: string }[] = [
  { mode: 'tree', emoji: '🌳', ariaLabel: 'Tree layout — vault file tree and editor' },
  { mode: 'browse', emoji: '🗂️', ariaLabel: 'Browse layout — grid and list file browser' },
]

export function VaultView() {
  const vaultMode = useUiStore((s) => s.vaultMode)
  const setVaultMode = useUiStore((s) => s.setVaultMode)

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <div
          className="bg-bg-tertiary flex rounded-lg p-0.5"
          role="tablist"
          aria-label="Vault layout"
        >
          {MODES.map(({ mode, emoji, ariaLabel }) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={vaultMode === mode}
              aria-label={ariaLabel}
              title={ariaLabel}
              onClick={() => setVaultMode(mode)}
              className={cn(
                'flex min-w-[2.25rem] items-center justify-center rounded-md px-2 py-1 text-lg leading-none transition-colors',
                vaultMode === mode
                  ? 'bg-bg text-fg shadow-sm'
                  : 'text-fg-tertiary hover:text-fg-secondary',
              )}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {vaultMode === 'browse' ? <FileBrowserView /> : <NotesView />}
      </div>
    </div>
  )
}
