import type { FileSystemAdapter } from '@/lib/fs'
import { titleForPath } from '@/core/registries'
import { createWikiLinkResolver, wikiStemKey } from '@/lib/markdown'
import { announceNoteWritten } from '@/lib/notes/note-written'
import { reindexFilePath } from '@/lib/search/build-vault-index'
import { getIndexLinks, getIndexManifest, whenSearchIndexOpen } from '@/lib/search/index'
import { toast } from '@/stores/toast'

const LINK_RE = /(!?)\[\[([^\]|]+)(\|[^\]]+)?\]\]/g

const baseName = (path: string) => path.split('/').pop() ?? path

/** A link target without its `#heading` (or `#page=`). */
function linkBase(target: string): string {
  const hash = target.indexOf('#')
  return (hash === -1 ? target : target.slice(0, hash)).trim()
}

/**
 * `text` with every wiki-link and embed that went to `oldPath` naming
 * `newPath` instead. A link keeps its folder, `#heading` and `|alias`, and
 * its extension if it was written with one.
 */
export function rewriteLinks(
  text: string,
  oldPath: string,
  newPath: string,
  resolve: (link: string) => string | null,
): string {
  const oldName = baseName(oldPath)
  return text.replace(LINK_RE, (whole, bang: string, target: string, alias = '') => {
    const base = linkBase(target)
    const slash = base.lastIndexOf('/')
    const seg = base.slice(slash + 1)
    // Only a link by the file's name, not one that matched part of a path.
    if (wikiStemKey(seg) !== wikiStemKey(oldName) || resolve(base) !== oldPath) return whole
    const renamed =
      seg.toLowerCase() === oldName.toLowerCase() ? baseName(newPath) : titleForPath(newPath)
    const rest = target.slice(target.indexOf(base) + base.length)
    return `${bang}[[${base.slice(0, slash + 1)}${renamed}${rest}${alias}]]`
  })
}

/**
 * After `oldPath` was renamed to `newPath`: point the links in other files at
 * the new name, and say how many files changed. A move or a change of type
 * (`Shop.md` → `Shop.list.md`) keeps the name, and links still find it.
 */
export async function updateLinksAfterRename(
  fs: FileSystemAdapter,
  oldPath: string,
  newPath: string,
): Promise<number> {
  if (wikiStemKey(baseName(oldPath)) === wikiStemKey(baseName(newPath))) return 0
  let changed = 0
  try {
    await whenSearchIndexOpen()
    const [rows, manifest] = await Promise.all([getIndexLinks(), getIndexManifest()])
    // Resolve as the links did before the rename.
    const paths = manifest.map((e) => (e.path === newPath ? oldPath : e.path))
    if (!paths.includes(oldPath)) paths.push(oldPath)
    const resolve = createWikiLinkResolver(paths.sort())
    const sources = new Set<string>()
    for (const { source, target } of rows) {
      if (resolve(linkBase(target)) === oldPath) sources.add(source === oldPath ? newPath : source)
    }
    for (const source of sources) {
      const text = await fs.readTextFile(source)
      const next = rewriteLinks(text, oldPath, newPath, resolve)
      if (next === text) continue
      await fs.writeTextFile(source, next)
      announceNoteWritten(source)
      await reindexFilePath(fs, source)
      changed++
    }
  } catch (err) {
    console.error('Failed to update links after a rename', err)
  }
  if (changed > 0) toast.success(`Updated links in ${changed} ${changed === 1 ? 'note' : 'notes'}`)
  return changed
}
