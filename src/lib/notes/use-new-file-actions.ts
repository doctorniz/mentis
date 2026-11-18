import { useCallback, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useUiStore } from '@/stores/ui'
import { useBoardStore } from '@/stores/board'
import { fileTypes } from '@/core/registries'
import type { FileTypeDefinition } from '@/core/registries/file-types'
import { createFileOfType, importFilesIntoVault } from '@/lib/notes/new-files'

export interface NewMenuItem {
  label: string
  icon: LucideIcon
  accent: string
  /** Position in the New menu, shared with the non-file entries (Thought, …). */
  order: number
  action: () => void
}

/**
 * Shared creation actions for new files and imports. Used by the sidebar
 * "New" menu and the mobile inline accordion.
 *
 * File creation is driven by each module's `createNew`, so a type that
 * declares one appears in `fileTypeMenuItems` without changes here. Each action
 * navigates to the Vault tree view and dispatches `ink:vault-changed`. The
 * caller supplies `onDone` (e.g. close popover / close drawer).
 */
export function useNewFileActions(onDone: () => void) {
  const { vaultFs } = useVaultSession()
  const [busy, setBusy] = useState(false)

  const createFile = useCallback(
    async (def: FileTypeDefinition) => {
      if (!def.createNew || busy) return
      setBusy(true)
      try {
        await createFileOfType(vaultFs, def)
        onDone()
      } finally {
        setBusy(false)
      }
    },
    [vaultFs, busy, onDone],
  )

  const fileTypeMenuItems = useMemo<NewMenuItem[]>(
    () =>
      fileTypes.all().flatMap((def) =>
        def.createNew
          ? [
              {
                label: def.createNew.label,
                icon: def.createNew.menu.icon,
                accent: def.createNew.menu.accentClass,
                order: def.createNew.menu.order,
                action: () => void createFile(def),
              },
            ]
          : [],
      ),
    [createFile],
  )

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!Array.from(files).length) return
      setBusy(true)
      try {
        if (await importFilesIntoVault(vaultFs, files)) onDone()
      } finally {
        setBusy(false)
      }
    },
    [vaultFs, onDone],
  )

  const createThought = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      await useBoardStore.getState().addThought(vaultFs)
      useUiStore.getState().setActiveView('board')
      window.dispatchEvent(new CustomEvent('ink:vault-changed'))
      onDone()
    } finally {
      setBusy(false)
    }
  }, [vaultFs, busy, onDone])

  return {
    fileTypeMenuItems,
    /** Create a file of this type in the default folder and open it. */
    createFile,
    createThought,
    importFiles,
    busy,
  }
}
