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
 */
export default function SidebarFiles() {
  const { vaultFs } = useVaultSession()
  const refreshToken = useFileTreeStore((s) => s.refreshToken)
  const starredPaths = useFileTreeStore((s) => s.starredPaths)
  const [panel, setPanel] = useState<'tree' | 'search'>('tree')

  // Ctrl+F and the Search button.
  const searchRequested = useUiStore((s) => s.vaultSearchRequested)
  useEffect(() => {
    if (!searchRequested || !useUiStore.getState().takeVaultSearchRequest()) return
    setPanel('search')
  }, [searchRequested])

  // Any part of the app that creates, renames or deletes a file says so.
  useEffect(() => {
    const handler = () => useFileTreeStore.getState().refreshTree()
    window.addEventListener('ink:vault-changed', handler)
    return () => window.removeEventListener('ink:vault-changed', handler)
  }, [])

  if (panel === 'search') {
    return <VaultLeftSearch onClose={() => setPanel('tree')} rootClassName={FILL} />
  }
  return (
    <NotesFileTree
      vaultFs={vaultFs}
      refreshToken={refreshToken}
      starredPaths={starredPaths}
      heading="Notes"
      onNoteCreated={() => window.dispatchEvent(new CustomEvent('ink:vault-changed'))}
      onGraphOpen={() => useUiStore.getState().setActiveView('graph')}
      rootClassName={FILL}
    />
  )
}
