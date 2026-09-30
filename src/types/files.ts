import { fileTypeIdOf } from '@/core/registries'

/**
 * Ids of the built-in file types, for readable comparisons. Not exhaustive: the
 * file-type registry (`@/core/registries`) is the source of truth, and a module
 * can add ids that are not listed here.
 */
export enum FileType {
  Markdown = 'markdown',
  Pdf = 'pdf',
  Canvas = 'canvas',
  Mindmap = 'mindmap',
  Kanban = 'kanban',
  Image = 'image',
  Docx = 'docx',
  Pptx = 'pptx',
  Spreadsheet = 'spreadsheet',
  Video = 'video',
  Audio = 'audio',
  Code = 'code',
  Other = 'other',
}

export interface FileEntry {
  name: string
  path: string
  /** File-type registry id, or 'other' (directories are 'other'). */
  type: string
  isDirectory: boolean
  size?: number
  createdAt?: string
  modifiedAt?: string
  children?: FileEntry[]
}

export interface FileStats {
  size: number
  createdAt: Date
  modifiedAt: Date
}

export interface FileMoveOperation {
  sourcePath: string
  destinationPath: string
}

/** Registry id for a file name, or 'other'. */
export function getFileType(filename: string): string {
  return fileTypeIdOf(filename)
}

export function isHiddenPath(path: string): boolean {
  const segments = path.split('/')
  return segments.some((s) => s.startsWith('_mentis') || s.startsWith('_assets'))
}
