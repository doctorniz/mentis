import type { FileSystemAdapter } from '@/lib/fs'
import { FileType } from '@/types/files'
import { isNotesTreeHidden } from '@/lib/notes/tree-filter'

/** Recursive vault scan: all `.md` paths (scoped adapter paths). */
export async function collectMarkdownPaths(
  fs: FileSystemAdapter,
  dir = '',
): Promise<string[]> {
  const entries = await fs.readdir(dir)
  const out: string[] = []
  for (const e of entries) {
    if (isNotesTreeHidden(e)) continue
    if (e.isDirectory) {
      out.push(...(await collectMarkdownPaths(fs, e.path)))
    } else if (e.type === FileType.Markdown) {
      out.push(e.path)
    }
  }
  return out
}
