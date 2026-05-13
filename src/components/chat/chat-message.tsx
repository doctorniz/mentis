'use client'

import { Bot, User } from 'lucide-react'

import { ChatAssistantHtml } from '@/components/chat/chat-assistant-html'
import { renderChatMarkdown } from '@/lib/chat/render-markdown'
import type { ChatMessage as ChatMessageT } from '@/types/chat'
import { cn } from '@/utils/cn'

interface ChatMessageProps {
  message: ChatMessageT
  /** Opens vault-relative paths from assistant source links (same tab). */
  onVaultPathOpen?: (path: string) => void
}

/**
 * Single chat bubble. Assistant messages render markdown (sanitized);
 * user messages render as plain text with whitespace preserved so code
 * pastes survive. A streaming cursor is shown at the tail of the
 * in-flight assistant message.
 */
export function ChatMessage({ message, onVaultPathOpen }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const showCursor = isAssistant && message.streaming

  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-3 py-2',
        isUser && 'bg-bg-hover/40 rounded-md',
      )}
    >
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-accent/15 text-accent' : 'bg-bg-muted text-fg-secondary',
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-fg-secondary mb-0.5 text-xs font-medium">
          {isUser ? 'You' : (message.model ?? 'Assistant')}
        </div>

        {message.error ? (
          <div className="text-danger text-sm">
            <p className="text-fg-secondary mb-1">There appears to be an error.</p>
            <p className="leading-snug">{message.error}</p>
          </div>
        ) : isUser ? (
          <div className="text-fg text-sm whitespace-pre-wrap break-words">
            {message.content}
          </div>
        ) : (
          <ChatAssistantHtml
            className={cn(
              'text-fg max-w-none',
            )}
            html={
              renderChatMarkdown(message.content) +
              (showCursor ? '<span class="chat-cursor">▌</span>' : '')
            }
            onVaultPathOpen={onVaultPathOpen}
          />
        )}
      </div>
    </div>
  )
}
