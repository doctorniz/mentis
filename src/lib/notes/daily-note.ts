import type { FileSystemAdapter } from '@/lib/fs'

const DAILY_DIR = 'daily'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function todayDailyNotePath(date = new Date()): string {
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  return `${DAILY_DIR}/${y}-${m}-${d}.md`
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
 * Open today's daily note, creating it (and the `daily/` folder) if it
 * doesn't exist yet. Returns the vault-relative path.
 */
export async function openOrCreateDailyNote(
  fs: FileSystemAdapter,
  date = new Date(),
): Promise<string> {
  const path = todayDailyNotePath(date)
  if (await fs.exists(path)) return path
  await fs.mkdir(DAILY_DIR)
  await fs.writeTextFile(path, dailyNoteContent(date))
  return path
}
