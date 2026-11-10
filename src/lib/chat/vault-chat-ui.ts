import { providerMeta } from '@/lib/chat/providers/meta'
import type { ChatProviderId, ChatThread } from '@/types/chat'

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
    `title: ${thread.title.replace(/:/g, '—')}`,
    `exported: ${new Date().toISOString()}`,
    `provider: ${providerLabel}`,
    `model: ${modelLabel}`,
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

export function sanitizeExportBasename(title: string): string {
  const t = title.trim() || 'chat'
  return t
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}
