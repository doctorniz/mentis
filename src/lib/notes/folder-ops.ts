import type { FileSystemAdapter } from '@/lib/fs'

/**
 * Recursively rename (move) a folder by copying all contents to
 * the new path and then removing the old directory.
 */
export async function renameFolder(
  fs: FileSystemAdapter,
  oldPath: string,
  newPath: string,
): Promise<void> {
  if (oldPath === newPath) return
  await fs.mkdir(newPath)
  const entries = await fs.readdir(oldPath)
  for (const entry of entries) {
    const dest = `${newPath}/${entry.name}`
    if (entry.isDirectory) {
      await renameFolder(fs, entry.path, dest)
    } else {
      const data = await fs.readFile(entry.path)
      await fs.writeFile(dest, data)
    }
  }
  await fs.removeDir(oldPath)
}

/**
 * Recursively collect all file paths under a directory.
 */
export async function collectFilePaths(
  fs: FileSystemAdapter,
  dirPath: string,
): Promise<string[]> {
  const result: string[] = []
  const entries = await fs.readdir(dirPath)
  for (const entry of entries) {
    if (entry.isDirectory) {
      result.push(...(await collectFilePaths(fs, entry.path)))
    } else {
      result.push(entry.path)
    }
  }
  return result
}
