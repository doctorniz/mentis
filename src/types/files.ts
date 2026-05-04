export enum FileType {
  Markdown = 'markdown',
  Pdf = 'pdf',
  Canvas = 'canvas',
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

export function getFileType(filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'md':
    case 'markdown':
      return FileType.Markdown
    case 'pdf':
      return FileType.Pdf
    case 'canvas':
      return FileType.Canvas
    case 'docx':
      return FileType.Docx
    case 'pptx':
      return FileType.Pptx
    case 'xlsx':
    case 'xls':
    case 'csv':
      return FileType.Spreadsheet
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return FileType.Image
    case 'mp3':
    case 'wav':
    case 'm4a':
    case 'aac':
    case 'flac':
    case 'wma':
      return FileType.Audio
    case 'mp4':
    case 'webm':
    case 'ogg':
    case 'mov':
    case 'mkv':
    case 'avi':
      return FileType.Video
    case 'html':
    case 'htm':
    case 'css':
    case 'scss':
    case 'less':
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
    case 'py':
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'xml':
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'bat':
    case 'ps1':
    case 'sql':
    case 'graphql':
    case 'gql':
    case 'env':
    case 'ini':
    case 'conf':
    case 'cfg':
    case 'log':
    case 'txt':
      return FileType.Code
    default:
      return FileType.Other
  }
}

export function isHiddenPath(path: string): boolean {
  const segments = path.split('/')
  return segments.some((s) => s.startsWith('_marrow') || s.startsWith('_assets'))
}
