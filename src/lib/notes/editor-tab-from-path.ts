import { fileTypes, titleForPath } from '@/core/registries'
import type { EditorTab } from '@/types/editor'
import type { FileSystemAdapter } from '@/lib/fs/types'

/** Editor tab type for a path, by suffix. Unknown files open as markdown. */
export function editorTabTypeFromVaultPath(path: string): EditorTab['type'] {
  return fileTypes.resolve(path)?.id ?? 'markdown'
}

/**
 * Like `editorTabTypeFromVaultPath`, but lets a module claim markdown (or
 * unknown files, which open as markdown) on content — a kanban board's
 * frontmatter, for example. The owning module decides; this file does not
 * know the rule.
 */
export async function detectEditorTabType(
  fs: FileSystemAdapter,
  path: string,
): Promise<EditorTab['type']> {
  const base = editorTabTypeFromVaultPath(path)
  if (base !== 'markdown') return base

  const detected = await fileTypes.detect(path, (p) => fs.readTextFile(p), {
    fallback: 'markdown',
  })
  return detected?.id ?? 'markdown'
}

/** Display title: file name without its type's suffix (code files keep it). */
export function titleFromVaultPath(path: string): string {
  return titleForPath(path)
}
