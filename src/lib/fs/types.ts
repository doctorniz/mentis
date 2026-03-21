import type { FileEntry, FileStats } from '@/types/files'

export interface FileSystemAdapter {
  readonly type: 'opfs' | 'fsapi' | 'tauri' | 'capacitor'

  init(): Promise<void>

  readFile(path: string): Promise<Uint8Array>
  readTextFile(path: string): Promise<string>

  writeFile(path: string, data: Uint8Array): Promise<void>
  writeTextFile(path: string, content: string): Promise<void>

  exists(path: string): Promise<boolean>
  stat(path: string): Promise<FileStats>

  mkdir(path: string): Promise<void>
  readdir(path: string): Promise<FileEntry[]>

  rename(oldPath: string, newPath: string): Promise<void>
  copy(sourcePath: string, destPath: string): Promise<void>
  remove(path: string): Promise<void>
  removeDir(path: string): Promise<void>

  watch?(path: string, callback: (event: FileWatchEvent) => void): () => void
}

export interface FileWatchEvent {
  type: 'create' | 'modify' | 'delete'
  path: string
}

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}
