'use client'

import { useCallback, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { useBoardStore } from '@/stores/board'
import { DEFAULT_VAULT_CONFIG } from '@/types/vault'
import { fileTypes, titleForPath, HOME_VIEW } from '@/core/registries'
import type { FileTypeDefinition } from '@/core/registries/file-types'
import { reindexFilePath, isIndexableTextPath } from '@/lib/search/build-vault-index'
import { allocateUniqueFilePath } from '@/lib/notes/new-note'
import { toast } from '@/stores/toast'

function useDefaultFolder() {
  return useVaultStore(
    (s) => s.config?.defaultNewFileFolder ?? DEFAULT_VAULT_CONFIG.defaultNewFileFolder,
  )
}

/** Should a lone imported file open in a tab? Its module decides. */
function opensAfterImport(path: string): FileTypeDefinition | null {
  const def = fileTypes.resolve(path)
  const rule = def?.openAfterImport
  if (!def || !rule) return null
  if (rule === true) return def
  const suffix = fileTypes.matchedSuffix(path)
  return suffix && rule.includes(suffix) ? def : null
}

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
  const defaultFolder = useDefaultFolder()
  const [busy, setBusy] = useState(false)

  const defaultDir = useCallback(
    (): string => (!defaultFolder || defaultFolder === '/' ? '' : defaultFolder),
    [defaultFolder],
  )

  const createFile = useCallback(
    async (def: FileTypeDefinition) => {
      const spec = def.createNew
      if (!spec || busy) return
      setBusy(true)
      try {
        const stem = `${spec.stem} ${new Date().toISOString().slice(0, 10)}`
        const dir = defaultDir()
        const rawPath = dir ? `${dir}/${stem}${spec.suffix}` : `${stem}${spec.suffix}`
        const path = await allocateUniqueFilePath(vaultFs, rawPath)
        const title = titleForPath(path)
        const makeContent = (await spec.content()).default
        const content = await makeContent({ title })
        if (typeof content === 'string') await vaultFs.writeTextFile(path, content)
        else await vaultFs.writeFile(path, content)

        const reveal = spec.revealInTree !== false
        useUiStore.getState().setActiveView(HOME_VIEW)
        useUiStore.getState().setVaultMode('tree')
        if (reveal) useFileTreeStore.getState().setSelectedPath(path)
        useEditorStore.getState().openTab({
          id: crypto.randomUUID(),
          path,
          type: def.id,
          title,
          isDirty: false,
          isNew: true,
        })
        if (reveal) useEditorStore.getState().addRecentFile(path)
        window.dispatchEvent(new CustomEvent('ink:vault-changed'))
        onDone()
      } finally {
        setBusy(false)
      }
    },
    [vaultFs, busy, onDone, defaultDir],
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
      const fileArr = Array.from(files)
      if (!fileArr.length) return
      setBusy(true)
      try {
        const dir = defaultDir()
        let count = 0
        let lastPath = ''
        for (const file of fileArr) {
          const buf = new Uint8Array(await file.arrayBuffer())
          const dest = dir ? `${dir}/${file.name}` : file.name
          await vaultFs.writeFile(dest, buf)
          if (isIndexableTextPath(dest)) await reindexFilePath(vaultFs, dest)
          lastPath = dest
          count++
        }
        window.dispatchEvent(new CustomEvent('ink:vault-changed'))
        useUiStore.getState().setActiveView(HOME_VIEW)

        if (count === 1) {
          const def = opensAfterImport(lastPath)
          if (def) {
            useUiStore.getState().setVaultMode('tree')
            useFileTreeStore.getState().setSelectedPath(lastPath)
            useEditorStore.getState().openTab({
              id: crypto.randomUUID(),
              path: lastPath,
              type: def.id,
              title: titleForPath(lastPath),
              isDirty: false,
            })
          }
        }

        toast.success(`Imported ${count} file${count !== 1 ? 's' : ''}`)
        onDone()
      } catch (e) {
        console.error('Import failed', e)
        toast.error('Failed to import files')
      } finally {
        setBusy(false)
      }
    },
    [vaultFs, onDone, defaultDir],
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
    createThought,
    importFiles,
    busy,
  }
}
