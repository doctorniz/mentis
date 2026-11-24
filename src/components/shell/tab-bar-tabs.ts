import { Search, type LucideIcon } from 'lucide-react'
import { views } from '@/core/registries'
import type { ViewId } from '@/core/registries/views'
import { useJournalStore } from '@/stores/journal'
import { useUiStore } from '@/stores/ui'
import { defaultTabs, useTabBarStore, type TabKey } from '@/stores/tab-bar'
import { useVaultStore } from '@/stores/vault'

/** The tabs in the bar: those picked in Settings, or the default for whether chat is on. */
export function useTabs(): TabKey[] {
  const chosen = useTabBarStore((s) => s.chosen)
  const chatOn = useVaultStore((s) => s.config?.chat?.enabled === true)
  return chosen ?? defaultTabs(chatOn)
}

export interface TabOption {
  key: TabKey
  label: string
  icon: LucideIcon
  /** Views that light this tab up. */
  views: readonly string[]
  run: () => void
}

function viewTab(key: TabKey, id: ViewId, label?: string, also: string[] = []): TabOption | null {
  const def = views.get(id)
  if (!def) return null
  return {
    key,
    label: label ?? def.label,
    icon: def.icon as LucideIcon,
    views: [id, ...also],
    run: () => useUiStore.getState().setActiveView(id),
  }
}

/** Every tab the bar can hold, in the order Settings lists them. */
export function tabOptions(): TabOption[] {
  const today = viewTab('today', 'journal', 'Today')
  return [
    today && { ...today, run: () => useJournalStore.getState().openDay() },
    viewTab('calendar', 'calendar'),
    // A file opened from the tree shows in the vault view: still Notes.
    viewTab('notes', 'tree', undefined, ['vault']),
    viewTab('chat', 'vault-chat'),
    viewTab('tasks', 'tasks'),
    viewTab('thoughts', 'board'),
    viewTab('bookmarks', 'bookmarks'),
    {
      key: 'search' as const,
      label: 'Search',
      icon: Search,
      views: [],
      run: () => useUiStore.getState().requestVaultSearch(),
    },
  ].filter((t): t is TabOption => t !== null)
}
