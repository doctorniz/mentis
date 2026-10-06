import type { FileSystemAdapter } from '@/lib/fs'
import { uniqueVaultPath } from '@/lib/fs/unique-path'

/**
 * Next available `Untitled.md`, `Untitled 2.md`, … at vault root.
 * Reuses `allocateUniqueFilePath` so the format is consistent with the
 * New-view creators.
 */
export async function allocateUntitledNotePath(fs: FileSystemAdapter): Promise<string> {
  return allocateUniqueFilePath(fs, 'Untitled.md')
}

/**
 * Given a desired file path, returns it unchanged if it doesn't exist, or the
 * next free `Name 2.ext`, `Name 3.ext`, … (see `uniqueVaultPath`). Pass
 * `suffix` for a compound suffix such as `.kan.md`.
 */
export function allocateUniqueFilePath(
  fs: FileSystemAdapter,
  desiredPath: string,
  suffix?: string,
): Promise<string> {
  return uniqueVaultPath(fs, desiredPath, suffix)
}

/** Quoted so that any title, e.g. one with a colon, can't break YAML parsing. */
export function getDefaultNoteContent(title = 'Untitled'): string {
  return ['---', `title: "${title}"`, `created: ${new Date().toISOString()}`, '---', '', ''].join(
    '\n',
  )
}

export async function createUntitledNote(fs: FileSystemAdapter): Promise<string> {
  const path = await allocateUntitledNotePath(fs)
  // Derive the title from the actual filename stem so it matches the file
  // tree display ("Untitled 2" rather than always "Untitled").
  const stem = path.replace(/\.md$/i, '').split('/').pop() ?? 'Untitled'
  await fs.writeTextFile(path, getDefaultNoteContent(stem))
  return path
}
