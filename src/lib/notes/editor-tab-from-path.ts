import { fileTypes } from '@/core/registries'
import type { EditorTab } from '@/types/editor'
import { FileType, getFileType } from '@/types/files'
import type { FileSystemAdapter } from '@/lib/fs/types'

export function editorTabTypeFromVaultPath(path: string): EditorTab['type'] {
  const name = path.split('/').pop() ?? path
  const ft = getFileType(name)
  switch (ft) {
    case FileType.Pdf:
      return 'pdf'
    case FileType.Canvas:
      return 'canvas'
    case FileType.Mindmap:
      return 'mindmap'
    case FileType.Kanban:
      return 'kanban'
    case FileType.Image:
      return 'image'
    case FileType.Video:
      return 'video'
    case FileType.Audio:
      return 'audio'
    case FileType.Docx:
      return 'docx'
    case FileType.Pptx:
      return 'pptx'
    case FileType.Spreadsheet:
      return 'spreadsheet'
    case FileType.Code:
      return 'code'
    default:
      return 'markdown'
  }
}

/**
 * Async variant that peeks at frontmatter for `.md` files to detect
 * special types like `kanban`. Falls back to extension-based detection
 * for non-markdown files or on read failure.
 */
export async function detectEditorTabType(
  fs: FileSystemAdapter,
  path: string,
): Promise<EditorTab['type']> {
  const base = editorTabTypeFromVaultPath(path)
  if (base !== 'markdown') return base

  // Markdown — or an unknown file, which opens as markdown — may be claimed by
  // another type on content (a kanban board's frontmatter). The owning module
  // decides; this file no longer knows the rule.
  const detected = await fileTypes.detect(path, (p) => fs.readTextFile(p), {
    fallback: 'markdown',
  })
  return (detected?.id as EditorTab['type'] | undefined) ?? 'markdown'
}

/** Display title: filename without extension (or with extension for code files). */
export function titleFromVaultPath(path: string): string {
  const name = path.split('/').pop() ?? path
  const ft = getFileType(name)
  // Keep the extension visible for code files
  if (ft === FileType.Code) return name
  return (
    path
      .replace(/\.[^/.]+$/i, '')
      .split('/')
      .pop() ?? path
  )
}
