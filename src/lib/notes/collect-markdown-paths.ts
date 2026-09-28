import type { FileSystemAdapter } from '@/lib/fs'
import { fileTypes } from '@/core/registries'
import { isNotesTreeHidden } from '@/lib/notes/tree-filter'

/**
 * Recursive vault scan for wiki-link targets: every file whose type is
 * `linkable` (notes, boards, maps, decks). Scoped adapter paths.
 */
export async function collectMarkdownPaths(fs: FileSystemAdapter, dir = ''): Promise<string[]> {
  const entries = await fs.readdir(dir)
  const out: string[] = []
  for (const e of entries) {
    if (isNotesTreeHidden(e)) continue
    if (e.isDirectory) {
      out.push(...(await collectMarkdownPaths(fs, e.path)))
    } else if (fileTypes.resolve(e.path)?.linkable) {
      out.push(e.path)
    }
  }
  return out
}
