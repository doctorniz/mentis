'use client'

import { AlertTriangle } from 'lucide-react'

import { renderChatMarkdown } from '@/lib/chat/render-markdown'
import type { ChatMessage as ChatMessageT } from '@/types/chat'
import { cn } from '@/utils/cn'

interface VaultChatMessageProps {
  message: ChatMessageT
}

/**
 * Vault-wide chat: user messages in a right-aligned coloured bubble;
 * assistant as plain left-aligned text (no avatar or bubble).
 */
export function VaultChatMessage({ message }: VaultChatMessageProps) {
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
      <div className="text-danger flex items-start gap-2 px-3 py-2 font-serif text-[12pt]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>{message.error}</span>
      </div>
    )
  }

  if (isAssistant) {
    return (
      <div className="text-fg max-w-[min(100%,42rem)] px-3 py-2 font-serif text-[12pt] leading-relaxed">
        <div
          className={cn(
            'prose prose-sm dark:prose-invert max-w-none',
            'prose-p:my-2 prose-pre:my-2 prose-pre:bg-bg-muted prose-pre:rounded-md prose-code:before:content-none prose-code:after:content-none',
          )}
          dangerouslySetInnerHTML={{
            __html:
              renderChatMarkdown(message.content) +
              (showCursor ? '<span class="chat-cursor">▌</span>' : ''),
          }}
        />
      </div>
    )
  }

  return null
}
