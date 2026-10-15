import type { FileSystemAdapter } from '@/lib/fs/types'
import { MENTIS_DIR } from '@/types/vault'
import { uniqueVaultPath } from '@/lib/fs/unique-path'
import { fileTypes } from '@/core/registries'

/**
 * Files sync deletes are moved here instead, under a folder per day:
 * `_mentis/trash/2026-10-16/<original path>`. Each side keeps its own
 * trash (the folder is excluded from sync); day folders older than a
 * month are emptied.
 */
export const TRASH_DIR = `${MENTIS_DIR}/trash`

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Local calendar day, `YYYY-MM-DD`. */
export function trashDay(when: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
}

export function trashPath(path: string, when: Date): string {
  return `${TRASH_DIR}/${trashDay(when)}/${path.replace(/^\/+/, '')}`
}

/** Day folder names more than a month older than `now`. Other names are left alone. */
export function expiredTrashDays(names: string[], now: Date): string[] {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - 1)
  const limit = trashDay(cutoff)
  return names.filter((n) => DAY.test(n) && n < limit)
}

/**
 * Move a vault file into today's trash folder. Copies, then removes the
 * original, so a failed write leaves the file where it was.
 */
export async function moveToLocalTrash(
  fs: FileSystemAdapter,
  path: string,
  now = new Date(),
): Promise<string> {
  const suffix = fileTypes.matchedSuffix(path)
  const dest = await uniqueVaultPath(fs, trashPath(path, now), suffix)
  const parent = dest.slice(0, dest.lastIndexOf('/'))
  await fs.mkdir(parent)
  await fs.writeFile(dest, await fs.readFile(path))
  await fs.remove(path)
  return dest
}

/** Empty this device's trash folders older than a month. */
export async function pruneLocalTrash(fs: FileSystemAdapter, now = new Date()): Promise<void> {
  if (!(await fs.exists(TRASH_DIR))) return
  const names = (await fs.readdir(TRASH_DIR)).filter((e) => e.isDirectory).map((e) => e.name)
  for (const name of expiredTrashDays(names, now)) {
    await fs.removeDir(`${TRASH_DIR}/${name}`)
  }
}
