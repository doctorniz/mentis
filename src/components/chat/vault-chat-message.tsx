'use client'

import { ChatAssistantHtml } from '@/components/chat/chat-assistant-html'
import { renderVaultChatMarkdown } from '@/lib/chat/render-markdown'
import type { ChatMessage as ChatMessageT } from '@/types/chat'
import { cn } from '@/utils/cn'

interface VaultChatMessageProps {
  message: ChatMessageT
  onVaultPathOpen?: (path: string) => void
}

/**
 * Vault-wide chat: user messages in a right-aligned coloured bubble;
 * assistant as plain left-aligned text (no avatar or bubble).
 */
export function VaultChatMessage({ message, onVaultPathOpen }: VaultChatMessageProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const showCursor = isAssistant && message.streaming

  if (isUser) {
    return (
      <div className="flex justify-end px-3 py-1.5 font-sans text-[12pt]">
        <div
          className={cn(
            'max-w-[min(85%,34rem)] rounded-2xl rounded-br-md px-3.5 py-2.5',
            'bg-accent text-accent-fg whitespace-pre-wrap break-words',
          )}
        >
          {message.content}
        </div>
      </div>
    )
  }

  if (message.error) {
    return (
      <div className="text-danger px-3 py-2 font-sans text-[12pt]">
        <p className="text-fg-secondary mb-1">There appears to be an error.</p>
        <p className="leading-snug">{message.error}</p>
      </div>
    )
  }

  if (isAssistant) {
    return (
      <div className="text-fg max-w-[min(100%,42rem)] px-3 py-2 font-sans">
        <ChatAssistantHtml
          className={cn(
            // Typography is driven by `.chat-assistant-prose` (+ Inter from root layout).
            'max-w-none',
          )}
          html={
            renderVaultChatMarkdown(message.content, message.vaultRagHitPaths) +
            (showCursor ? '<span class="chat-cursor">▌</span>' : '')
          }
          onVaultPathOpen={onVaultPathOpen}
        />
      </div>
    )
  }

  return null
}
