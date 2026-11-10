import { providerMeta } from '@/lib/chat/providers/meta'
import { uniqueVaultPath } from '@/lib/fs/unique-path'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { ChatProviderId, ChatThread } from '@/types/chat'
import { CHAT_DIR, type VaultConfig } from '@/types/vault'

/** A chat saved to the vault: `Title.chat.md`, in the chat folder. */
export const CHAT_SUFFIX = '.chat.md'

/** The folder saved chats go to. */
export function chatDir(config?: Pick<VaultConfig, 'chatFolder'> | null): string {
  return config?.chatFolder?.replace(/^\/+|\/+$/g, '') || CHAT_DIR
}

/** Where to save a chat: the chat folder, made if missing, under a name nothing there has. */
export async function savedChatPath(
  fs: FileSystemAdapter,
  config: Pick<VaultConfig, 'chatFolder'> | null | undefined,
  title: string,
): Promise<string> {
  const dir = chatDir(config)
  let walked = ''
  for (const part of dir.split('/')) {
    walked = walked ? `${walked}/${part}` : part
    if (!(await fs.exists(walked))) await fs.mkdir(walked)
  }
  const path = `${dir}/${sanitizeExportBasename(title)}${CHAT_SUFFIX}`
  return uniqueVaultPath(fs, path, CHAT_SUFFIX)
}

export function chatProviderLabel(id: ChatProviderId | null | undefined): string {
  if (!id) return '—'
  // A thread from a provider that no longer exists keeps its id as its name.
  return providerMeta(id)?.label ?? id
}

export function vaultChatGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function threadToMarkdown(
  thread: ChatThread,
  providerLabel: string,
  modelLabel: string,
): string {
  const lines: string[] = [
    '---',
    'type: chat',
    // Quoted, so any title is valid YAML.
    `title: ${JSON.stringify(thread.title)}`,
    `exported: ${new Date().toISOString()}`,
    `provider: ${JSON.stringify(providerLabel)}`,
    `model: ${JSON.stringify(modelLabel)}`,
    '---',
    '',
  ]
  for (const m of thread.messages) {
    if (m.role === 'user') {
      lines.push(`## You`, '', m.content.trim(), '', '---', '')
    } else if (m.role === 'assistant') {
      lines.push(`## Assistant`, '', m.content.trim(), '', '---', '')
    }
  }
  return lines.join('\n').trimEnd() + '\n'
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

/** A file name from a title: no character a file system refuses, no reserved Windows name. */
export function sanitizeExportBasename(title: string): string {
  const t = title
    .replace(/[\u0000-\u001f/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '')
  if (!t) return 'chat'
  return WINDOWS_RESERVED.test(t) ? `_${t}` : t
}
