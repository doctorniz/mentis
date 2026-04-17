'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bookmark, Loader2, Plus } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { BookmarkCard } from '@/components/bookmarks/bookmark-card'
import { AddBookmarkDialog } from '@/components/bookmarks/add-bookmark-dialog'
import { CategorySidebar } from '@/components/bookmarks/category-sidebar'
import { useBookmarksStore } from '@/stores/bookmarks'
import type { BookmarkItem } from '@/types/bookmarks'

export function BookmarksView() {
  const { vaultFs } = useVaultSession()
  const items = useBookmarksStore((s) => s.items)
  const loading = useBookmarksStore((s) => s.loading)
  const loadBookmarks = useBookmarksStore((s) => s.loadBookmarks)
  const activeCategory = useBookmarksStore((s) => s.activeCategory)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<BookmarkItem | null>(null)

  useEffect(() => {
    void loadBookmarks(vaultFs)
  }, [vaultFs, loadBookmarks])

  const filtered = useMemo(
    () =>
      activeCategory === null
        ? items
        : items.filter((i) => i.category === activeCategory),
    [items, activeCategory],
  )

  const handleAdd = useCallback(() => {
    setEditItem(null)
    setDialogOpen(true)
  }, [])

  const handleEdit = useCallback((item: BookmarkItem) => {
    setEditItem(item)
    setDialogOpen(true)
  }, [])

  return (
    <div className="flex h-full min-h-0 w-full">
      <CategorySidebar />

      <div className="border-border flex min-h-0 flex-1 flex-col border-l">
        {/* Header */}
        <div className="border-border bg-bg-secondary flex shrink-0 items-center justify-between border-b px-4 py-2.5">
          <h1 className="text-fg text-sm font-semibold">
            {activeCategory ?? 'All Bookmarks'}
          </h1>
          <button
            type="button"
            onClick={handleAdd}
            className="bg-accent text-accent-fg hover:bg-accent/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <Plus className="size-3.5" />
            Bookmark
          </button>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="text-fg-muted size-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
              <Bookmark className="text-fg-muted/30 size-10" />
              <p className="text-fg-muted text-sm">
                {activeCategory
                  ? `No bookmarks in "${activeCategory}".`
                  : 'No bookmarks yet.'}
              </p>
              <button
                type="button"
                onClick={handleAdd}
                className="bg-accent text-accent-fg hover:bg-accent/90 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                <Plus className="size-4" />
                Add your first bookmark
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-4">
              {filtered.map((item) => (
                <BookmarkCard key={item.path} item={item} onEdit={handleEdit} />
              ))}
            </div>
          )}
        </div>
      </div>

      <AddBookmarkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editItem={editItem}
      />
    </div>
  )
}
