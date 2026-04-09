import type { EditorTab } from '@/types/editor'
import { FileType, getFileType } from '@/types/files'

export function editorTabTypeFromVaultPath(path: string): EditorTab['type'] {
  const name = path.split('/').pop() ?? path
  const ft = getFileType(name)
  switch (ft) {
    case FileType.Pdf:
      return 'pdf'
    case FileType.Canvas:
      return 'canvas'
    case FileType.Image:
      return 'image'
    default:
      return 'markdown'
  }
}

/** Display title: filename without extension. */
export function titleFromVaultPath(path: string): string {
  return path.replace(/\.[^/.]+$/i, '').split('/').pop() ?? path
}
