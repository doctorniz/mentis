import type { FileSystemAdapter } from '@/lib/fs'
import { TEMPLATES_DIR } from '@/types/vault'

export interface NoteTemplate {
  id: string
  name: string
  filename: string
}

export async function listTemplates(
  vaultFs: FileSystemAdapter,
  dir = TEMPLATES_DIR,
): Promise<NoteTemplate[]> {
  try {
    const entries = await vaultFs.readdir(dir)
    return entries
      .filter((e) => !e.isDirectory && e.name.endsWith('.md'))
      .map((e) => ({
        id: e.name,
        name: e.name.replace(/\.md$/, ''),
        filename: e.name,
      }))
  } catch {
    return []
  }
}

export async function readTemplate(
  vaultFs: FileSystemAdapter,
  filename: string,
  dir = TEMPLATES_DIR,
): Promise<string> {
  return vaultFs.readTextFile(`${dir}/${filename}`)
}

export async function saveTemplate(
  vaultFs: FileSystemAdapter,
  filename: string,
  content: string,
  dir = TEMPLATES_DIR,
): Promise<void> {
  await vaultFs.mkdir(dir)
  await vaultFs.writeTextFile(`${dir}/${filename}`, content)
}

export async function deleteTemplate(
  vaultFs: FileSystemAdapter,
  filename: string,
  dir = TEMPLATES_DIR,
): Promise<void> {
  await vaultFs.remove(`${dir}/${filename}`)
}
