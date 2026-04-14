'use client'

import type { ReactNode } from 'react'
import { useUiStore } from '@/stores/ui'
import { ViewMode } from '@/types/vault'
import { VaultView } from '@/components/views/vault-view'
import { SearchView } from '@/components/views/search-view'
import { GraphView } from '@/components/views/graph-view'
import { BoardView } from '@/components/views/board-view'
import { NewView } from '@/components/views/new-view'

export function ViewRouter() {
  const activeView = useUiStore((s) => s.activeView)

  let body: ReactNode
  switch (activeView) {
    case ViewMode.Vault:
    // legacy routes — redirect into the unified vault view
    case ViewMode.FileBrowser:
    case ViewMode.Notes:
      body = <VaultView />
      break
    case ViewMode.Search:
      body = <SearchView />
      break
    case ViewMode.Graph:
      body = <GraphView />
      break
    case ViewMode.Board:
      body = <BoardView />
      break
    case ViewMode.New:
      body = <NewView />
      break
    default:
      body = <VaultView />
  }

  return <div className="flex h-full min-h-0 flex-1 flex-col">{body}</div>
}
