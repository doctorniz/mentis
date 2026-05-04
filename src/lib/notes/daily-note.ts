import type { FileSystemAdapter } from '@/lib/fs'
import { DAILY_NOTES_DIR } from '@/types/vault'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Vault-relative path for a day's note under the given folder. */
export function todayDailyNotePath(date = new Date(), folder = DAILY_NOTES_DIR): string {
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  const dir = folder.replace(/^\/+|\/+$/g, '') || DAILY_NOTES_DIR
  return `${dir}/${y}-${m}-${d}.md`
}

export function dailyNoteTitle(date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function dailyNoteContent(date = new Date()): string {
  const title = dailyNoteTitle(date)
  return [
    '---',
    `title: ${title}`,
    `created: ${date.toISOString()}`,
    'tags: [daily]',
    '---',
    '',
    `# ${title}`,
    '',
    '',
  ].join('\n')
}

/**
 * Open today's daily note, creating it (and the folder) if it doesn't
 * exist yet. Returns the vault-relative path.
 */
export async function openOrCreateDailyNote(
  fs: FileSystemAdapter,
  date = new Date(),
  folder = DAILY_NOTES_DIR,
): Promise<string> {
  const dir = folder.replace(/^\/+|\/+$/g, '') || DAILY_NOTES_DIR
  const path = todayDailyNotePath(date, dir)
  if (await fs.exists(path)) return path
  await fs.mkdir(dir)
  await fs.writeTextFile(path, dailyNoteContent(date))
  return path
}

/**
 * Returns a Set of YYYY-MM-DD strings for every daily note that exists in
 * the given folder. Non-matching filenames are silently ignored.
 */
export async function listDailyNoteDates(
  fs: FileSystemAdapter,
  folder = DAILY_NOTES_DIR,
): Promise<Set<string>> {
  const dir = folder.replace(/^\/+|\/+$/g, '') || DAILY_NOTES_DIR
  const dates = new Set<string>()
  try {
    const entries = await fs.readdir(dir)
    for (const e of entries) {
      if (e.isDirectory) continue
      // Match YYYY-MM-DD.md
      const m = e.name.match(/^(\d{4}-\d{2}-\d{2})\.md$/i)
      if (m) dates.add(m[1]!)
    }
  } catch {
    // Folder may not exist yet — return empty set
  }
  return dates
}

/**
 * Moves all YYYY-MM-DD.md files from `oldFolder` to `newFolder`.
 * Creates `newFolder` if it doesn't exist.
 * No-op if old and new folders are the same (after normalisation).
 */
export async function migrateDailyNotesFolder(
  fs: FileSystemAdapter,
  oldFolder: string,
  newFolder: string,
): Promise<void> {
  const oldDir = oldFolder.replace(/^\/+|\/+$/g, '') || DAILY_NOTES_DIR
  const newDir = newFolder.replace(/^\/+|\/+$/g, '') || DAILY_NOTES_DIR
  if (oldDir === newDir) return

  let entries: Awaited<ReturnType<FileSystemAdapter['readdir']>> = []
  try {
    entries = await fs.readdir(oldDir)
  } catch {
    return // nothing to migrate
  }

  const daily = entries.filter((e) => !e.isDirectory && /^\d{4}-\d{2}-\d{2}\.md$/i.test(e.name))
  if (!daily.length) return

  await fs.mkdir(newDir)
  for (const e of daily) {
    const srcPath = `${oldDir}/${e.name}`
    const dstPath = `${newDir}/${e.name}`
    try {
      if (!(await fs.exists(dstPath))) {
        await fs.rename(srcPath, dstPath)
      }
    } catch {
      // Best-effort — skip files that can't be moved
    }
  }
}
