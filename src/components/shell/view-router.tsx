'use client'

import type { ReactNode } from 'react'
import { useUiStore } from '@/stores/ui'
import { ViewMode } from '@/types/vault'
import { VaultView } from '@/components/views/vault-view'
import { FilesView } from '@/components/views/files-view'
import { GraphView } from '@/components/views/graph-view'
import { BoardView } from '@/components/views/board-view'
import { BookmarksView } from '@/components/views/bookmarks-view'
import { NewView } from '@/components/views/new-view'
import { OrganizerView } from '@/components/views/organizer-view'
import { VaultChatView } from '@/components/views/vault-chat-view'

export function ViewRouter() {
  const activeView = useUiStore((s) => s.activeView)

  let body: ReactNode
  switch (activeView) {
    case ViewMode.VaultChat:
      body = <VaultChatView />
      break
    case ViewMode.Vault:
    // legacy routes — redirect into the vault (notes) view
    case ViewMode.FileBrowser:
    case ViewMode.Notes:
      body = <VaultView />
      break
    case ViewMode.Files:
      body = <FilesView />
      break
    // Search is now embedded in the Vault left column — redirect to Vault
    case ViewMode.Search:
      body = <VaultView />
      break
    case ViewMode.Graph:
      body = <GraphView />
      break
    case ViewMode.Board:
      body = <BoardView />
      break
    // Legacy routes — redirect into Organizer
    case ViewMode.Tasks:
      body = <OrganizerView initialTab="tasks" />
      break
    case ViewMode.Calendar:
      body = <OrganizerView initialTab="calendars" />
      break
    case ViewMode.Organizer:
      body = <OrganizerView />
      break
    case ViewMode.Bookmarks:
      body = <BookmarksView />
      break
    case ViewMode.New:
      body = <NewView />
      break
    default:
      body = <VaultView />
  }

  return <div className="flex h-full min-h-0 flex-1 flex-col">{body}</div>
}
