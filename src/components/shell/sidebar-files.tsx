import { useEffect, useState } from 'react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { NotesFileTree } from '@/components/notes/notes-file-tree'
import { VaultLeftSearch } from '@/components/notes/vault-left-search'
import { useFileTreeStore } from '@/stores/file-tree'
import { useUiStore } from '@/stores/ui'

const FILL = 'h-auto min-h-0 w-full max-w-none flex-1 border-r-0 bg-transparent'

/**
 * The sidebar's lower half: the vault's file tree, or search in its place.
 * Loaded after the shell, so the tree is not part of startup.
 *
 * `searchBar`: the sidebar has a search bar of its own above, so results show while it holds
 * text and the tree returns when it is cleared. Without it (a phone's Notes tab) the search
 * panel brings its own bar.
 */
export default function SidebarFiles({ searchBar = false }: { searchBar?: boolean }) {
  const { vaultFs } = useVaultSession()
  const refreshToken = useFileTreeStore((s) => s.refreshToken)
  const starredPaths = useFileTreeStore((s) => s.starredPaths)
  const [panel, setPanel] = useState<'tree' | 'search'>('tree')
  const barQuery = useUiStore((s) => s.vaultSearchQuery)

  // Ctrl+F and the Search tab, where the panel has its own bar.
  const searchRequested = useUiStore((s) => s.vaultSearchRequested)
  useEffect(() => {
    if (searchBar || !searchRequested || !useUiStore.getState().takeVaultSearchRequest()) return
    setPanel('search')
  }, [searchBar, searchRequested])

  // Any part of the app that creates, renames or deletes a file says so.
  useEffect(() => {
    const handler = () => useFileTreeStore.getState().refreshTree()
    window.addEventListener('ink:vault-changed', handler)
    return () => window.removeEventListener('ink:vault-changed', handler)
  }, [])

  if (searchBar && barQuery.trim()) {
    return (
      <VaultLeftSearch
        query={barQuery}
        onClose={() => useUiStore.getState().setVaultSearchQuery('')}
        rootClassName={FILL}
      />
    )
  }
  if (!searchBar && panel === 'search') {
    return <VaultLeftSearch onClose={() => setPanel('tree')} rootClassName={FILL} />
  }
  return (
    <NotesFileTree
      vaultFs={vaultFs}
      refreshToken={refreshToken}
      starredPaths={starredPaths}
      heading="Notes"
      pinnedViews={searchBar}
      onNoteCreated={() => window.dispatchEvent(new CustomEvent('ink:vault-changed'))}
      onGraphOpen={() => useUiStore.getState().setActiveView('graph')}
      rootClassName={FILL}
    />
  )
}
