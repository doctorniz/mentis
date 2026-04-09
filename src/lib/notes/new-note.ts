import type { FileSystemAdapter } from '@/lib/fs'

/** Next available `untitled.md`, `untitled-1.md`, … at vault root. */
export async function allocateUntitledNotePath(fs: FileSystemAdapter): Promise<string> {
  const base = 'untitled'
  let candidate = `${base}.md`
  let i = 0
  while (await fs.exists(candidate)) {
    i += 1
    candidate = `${base}-${i}.md`
  }
  return candidate
}

export function getDefaultNoteContent(title = 'Untitled'): string {
  return ['---', `title: ${title}`, `created: ${new Date().toISOString()}`, '---', '', ''].join('\n')
}

export async function createUntitledNote(fs: FileSystemAdapter): Promise<string> {
  const path = await allocateUntitledNotePath(fs)
  await fs.writeTextFile(path, getDefaultNoteContent())
  return path
}
