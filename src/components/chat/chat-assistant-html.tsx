'use client'

import { useCallback, type MouseEvent } from 'react'

import { cn } from '@/utils/cn'

/**
 * Sanitized assistant HTML from `renderChatMarkdown`. Handles in-app navigation
 * for vault paths rewritten to `a.chat-vault-source`.
 */
export function ChatAssistantHtml({
  className,
  html,
  onVaultPathOpen,
}: {
  className?: string
  html: string
  onVaultPathOpen?: (path: string) => void
}) {
  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!onVaultPathOpen) return
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(
        'a.chat-vault-source',
      )
      if (!a) return
      e.preventDefault()
      const path = a.getAttribute('data-ink-path')
      if (path) onVaultPathOpen(path)
    },
    [onVaultPathOpen],
  )

  return (
    <div
      className={cn('chat-assistant-prose', className)}
      // eslint-disable-next-line react/no-danger -- sanitized in render-markdown
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={onVaultPathOpen ? handleClick : undefined}
    />
  )
}
