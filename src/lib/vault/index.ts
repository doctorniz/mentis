import type { FileSystemAdapter } from '@/lib/fs'
import { createScopedAdapter } from '@/lib/fs'
import {
  type VaultConfig,
  DEFAULT_VAULT_CONFIG,
  MENTIS_DIR,
  SIGNATURES_DIR,
  TEMPLATES_DIR,
  SNAPSHOTS_DIR,
  CONFIG_FILE,
} from '@/types/vault'
import { migrateChatSettings } from '@/lib/chat/migrate-settings'
import { uniqueVaultSlug, vaultFolderPath, vaultsRootPath } from '@/lib/vault/paths'

export async function createVault(fs: FileSystemAdapter, name: string): Promise<VaultConfig> {
  const config: VaultConfig = { ...DEFAULT_VAULT_CONFIG, name }

  await fs.mkdir(MENTIS_DIR)
  await fs.mkdir(SIGNATURES_DIR)
  await fs.mkdir(TEMPLATES_DIR)
  await fs.mkdir(SNAPSHOTS_DIR)

  await fs.writeTextFile(CONFIG_FILE, JSON.stringify(config, null, 2))

  // Only seed Welcome.md when the folder is truly empty (no existing user files).
  const hasExistingFiles = await (async () => {
    try {
      const entries = await fs.readdir('/')
      return entries.some(
        (e) => !e.isDirectory && !e.name.startsWith('_') && !e.name.startsWith('.'),
      )
    } catch {
      return false
    }
  })()

  if (!hasExistingFiles) {
    await fs.writeTextFile(WELCOME_NOTE, welcomeNote(name))
    welcomePending = true
  }

  return config
}

/** The note a new, empty vault starts with, and opens on. */
export const WELCOME_NOTE = 'Welcome.md'

let welcomePending = false

/** True once after a vault was created with a Welcome note, so the shell opens it. */
export function takeWelcomePending(): boolean {
  const pending = welcomePending
  welcomePending = false
  return pending
}

function localDay(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function welcomeNote(name: string): string {
  return [
    '---',
    'title: Welcome',
    `created: ${new Date().toISOString()}`,
    '---',
    '',
    '# Welcome to Mentis',
    '',
    `This is your **${name}** vault. Everything in it is an ordinary file in this folder:`,
    'notes are Markdown, and you can open, copy or back them up with any other app.',
    '',
    '## Capture',
    '',
    'Type into the capture bar and press Enter: it goes to **Thoughts**. Start with `/` to',
    'send it somewhere else:',
    '',
    '- `/task Call the bank tomorrow 9am` adds a task with a due time',
    '- `/cal Lunch with Sam Friday 1pm` adds an event',
    '- `/journal`, `/list`, `/bookmark` and `/note` do what they say',
    '',
    '## Notes',
    '',
    'Every folder at the top of the vault is a notebook, and its subfolders are sections.',
    'Link notes with `[[Note name]]`; backlinks show which notes point here.',
    '',
    '## Tasks',
    '',
    'A task is a checkbox line in any note, with a due day and time, a priority',
    'and tags if you like:',
    '',
    '```',
    `- [ ] Renew passport >${localDay()} 09:00 !2 #errands`,
    '```',
    '',
    'The Tasks page gathers them from every note.',
    '',
    '## Everything else',
    '',
    '- **Calendar**: each event is a note in `Calendar/`',
    '- **Journal**: one note a day in `Journal/`',
    '- **PDFs**: open, highlight, annotate and sign them',
    '- **Canvas**, mind maps, boards and slides: create them from **New**',
    '- **Search** finds words in every note and PDF',
    '- **Voice notes** are recorded and transcribed on this device',
    '',
    'Edits save as you type. Delete this note whenever you like.',
    '',
  ].join('\n')
}

export async function loadVaultConfig(fs: FileSystemAdapter): Promise<VaultConfig> {
  try {
    const raw = await fs.readTextFile(CONFIG_FILE)
    const parsed = JSON.parse(raw) as Partial<VaultConfig>
    const merged = { ...DEFAULT_VAULT_CONFIG, ...parsed }

    // Drop removed Nextcloud provider from legacy JSON
    if (merged.sync) {
      const legacyProvider = (parsed as { sync?: { provider?: string | null } }).sync?.provider
      if (legacyProvider === 'nextcloud') {
        merged.sync = { ...merged.sync, provider: null }
      }
    }

    if (merged.chat) merged.chat = migrateChatSettings(merged.chat)

    return merged
  } catch {
    return DEFAULT_VAULT_CONFIG
  }
}

export async function saveVaultConfig(fs: FileSystemAdapter, config: VaultConfig): Promise<void> {
  await fs.writeTextFile(CONFIG_FILE, JSON.stringify(config, null, 2))
}

export async function isVault(fs: FileSystemAdapter): Promise<boolean> {
  return fs.exists(MENTIS_DIR)
}

/**
 * Create a new vault folder under OPFS `vaults/<slug>/` and initialize structure.
 */
export async function bootstrapNewVault(
  rootFs: FileSystemAdapter,
  displayName: string,
): Promise<{ vaultPath: string; config: VaultConfig }> {
  await rootFs.mkdir(vaultsRootPath())
  const slug = uniqueVaultSlug(displayName)
  const folder = vaultFolderPath(slug)
  await rootFs.mkdir(folder)
  const scoped = createScopedAdapter(rootFs, folder)
  const config = await createVault(scoped, displayName)
  return { vaultPath: folder, config }
}
