import { fileTypes } from '@/core/registries'

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
  type: FileType
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

/**
 * Transitional shim: answers through the file-type registry. FileType values are
 * the registry ids. Callers move to `fileTypes` from `@/core/registries` directly.
 */
export function getFileType(filename: string): FileType {
  return (fileTypes.resolve(filename)?.id as FileType | undefined) ?? FileType.Other
}

export function isHiddenPath(path: string): boolean {
  const segments = path.split('/')
  return segments.some((s) => s.startsWith('_marrow') || s.startsWith('_assets'))
}
