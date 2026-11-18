import type { FileSystemAdapter } from '@/lib/fs'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { DEFAULT_VAULT_CONFIG } from '@/types/vault'
import { fileTypes, titleForPath, HOME_VIEW } from '@/core/registries'
import type { FileTypeDefinition } from '@/core/registries/file-types'
import { reindexFilePath, isIndexableTextPath } from '@/lib/search/build-vault-index'
import { allocateUniqueFilePath } from '@/lib/notes/new-note'
import { toast } from '@/stores/toast'

/**
 * Creating and importing files, and opening the result: shared by the New
 * menu (use-new-file-actions.ts) and the capture bar's `/file`, `/photo` and
 * `/canvas`.
 */

/** The folder new files go to ('' for the vault's root), from Settings. */
export function newFileFolder(): string {
  const folder =
    useVaultStore.getState().config?.defaultNewFileFolder ??
    DEFAULT_VAULT_CONFIG.defaultNewFileFolder
  return !folder || folder === '/' ? '' : folder
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

/** Create a file of this type in the default folder and open it. Resolves to its path. */
export async function createFileOfType(
  vaultFs: FileSystemAdapter,
  def: FileTypeDefinition,
): Promise<string | null> {
  const spec = def.createNew
  if (!spec) return null
  const stem = `${spec.stem} ${new Date().toISOString().slice(0, 10)}`
  const dir = newFileFolder()
  const rawPath = dir ? `${dir}/${stem}${spec.suffix}` : `${stem}${spec.suffix}`
  const path = await allocateUniqueFilePath(vaultFs, rawPath, spec.suffix)
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
  return path
}

/**
 * Copy files into the default folder (never over a file of the same name),
 * and open a lone one that its module says should open. Resolves to how many
 * were imported; shows its own error.
 */
export async function importFilesIntoVault(
  vaultFs: FileSystemAdapter,
  files: FileList | File[],
): Promise<number> {
  const fileArr = Array.from(files)
  if (!fileArr.length) return 0
  try {
    const dir = newFileFolder()
    let count = 0
    let lastPath = ''
    for (const file of fileArr) {
      const buf = new Uint8Array(await file.arrayBuffer())
      const dest = await allocateUniqueFilePath(vaultFs, dir ? `${dir}/${file.name}` : file.name)
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
    return count
  } catch (e) {
    console.error('Import failed', e)
    toast.error('Failed to import files')
    return 0
  }
}
