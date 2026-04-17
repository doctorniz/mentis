'use client'

import { useCallback, useState } from 'react'
import { ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useBookmarksStore } from '@/stores/bookmarks'
import type { BookmarkItem } from '@/types/bookmarks'
import { cn } from '@/utils/cn'

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days < 1) return 'Today'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function BookmarkCard({
  item,
  onEdit,
}: {
  item: BookmarkItem
  onEdit: (item: BookmarkItem) => void
}) {
  const { vaultFs } = useVaultSession()
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark)
  const [hovered, setHovered] = useState(false)

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      void removeBookmark(vaultFs, item.path)
    },
    [vaultFs, item.path, removeBookmark],
  )

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      onEdit(item)
    },
    [onEdit, item],
  )

  const handleCardClick = useCallback(() => {
    window.open(item.url, '_blank', 'noopener,noreferrer')
  }, [item.url])

  return (
    <div
      role="link"
      tabIndex={0}
      className={cn(
        'border-border bg-bg group relative flex cursor-pointer gap-3 rounded-lg border p-3 transition-all duration-150',
        'hover:shadow-sm hover:border-border-strong',
      )}
      onClick={handleCardClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Favicon + main content */}
      <div className="flex min-w-0 flex-1 gap-3">
        {item.favicon && (
          <img
            src={item.favicon}
            alt=""
            className="mt-0.5 size-5 shrink-0 rounded-sm"
            loading="lazy"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-fg truncate text-sm font-semibold">
              {item.title || domainFromUrl(item.url)}
            </span>
            <ExternalLink className="text-fg-muted/40 size-3 shrink-0" />
          </div>

          <span className="text-fg-muted/60 text-xs">{domainFromUrl(item.url)}</span>

          {item.description && (
            <p className="text-fg-secondary mt-1 line-clamp-2 text-xs leading-relaxed">
              {item.description}
            </p>
          )}

          {item.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-accent/10 text-accent rounded-full px-2 py-0.5 text-[10px] font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="text-fg-muted/40 mt-1.5 flex items-center gap-2 text-[10px]">
            <span>{formatDate(item.modified)}</span>
            {item.category && (
              <>
                <span>&middot;</span>
                <span>{item.category}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right column: OG image + action buttons below it */}
      <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
        {item.ogImage && (
          <img
            src={item.ogImage}
            alt=""
            className="h-16 w-24 rounded-md object-cover"
            loading="lazy"
          />
        )}
        {hovered && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleEdit}
              className="text-fg-muted/50 hover:text-fg hover:bg-bg-tertiary rounded-md p-1 transition-colors"
              aria-label="Edit bookmark"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="text-fg-muted/50 hover:text-destructive hover:bg-destructive/10 rounded-md p-1 transition-colors"
              aria-label="Delete bookmark"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
