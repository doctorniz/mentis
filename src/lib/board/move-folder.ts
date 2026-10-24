import type { FileSystemAdapter } from '@/lib/fs/types'

/**
 * Move every thought from `oldFolder` to `newFolder`, then remove
 * `oldFolder` if nothing else is left in it. Every note in the Thoughts
 * folder is a thought, so a folder that already holds anything is refused:
 * its notes would turn into thoughts.
 */
export async function moveThoughtsFolder(
  fs: FileSystemAdapter,
  oldFolder: string,
  newFolder: string,
): Promise<void> {
  const oldDir = oldFolder.replace(/^\/+|\/+$/g, '')
  const newDir = newFolder.replace(/^\/+|\/+$/g, '')
  if (!newDir) throw new Error('Choose a folder')
  if (oldDir === newDir) return
  if (newDir.startsWith(`${oldDir}/`)) throw new Error(`${newDir} is inside ${oldDir}`)
  if ((await fs.exists(newDir)) && (await fs.readdir(newDir)).length > 0) {
    throw new Error(`${newDir} is not empty`)
  }

  await fs.mkdir(newDir)
  if (!(await fs.exists(oldDir))) return
  for (const e of await fs.readdir(oldDir)) {
    if (e.isDirectory || !e.name.endsWith('.md')) continue
    await fs.rename(`${oldDir}/${e.name}`, `${newDir}/${e.name}`)
  }
  if ((await fs.readdir(oldDir)).length === 0) await fs.removeDir(oldDir)
}
