'use client'

import { useCallback, useRef, useState } from 'react'
import { FolderOpen, Plus, Trash2 } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useBookmarksStore } from '@/stores/bookmarks'
import { cn } from '@/utils/cn'

export function CategorySidebar() {
  const { vaultFs } = useVaultSession()
  const items = useBookmarksStore((s) => s.items)
  const categories = useBookmarksStore((s) => s.categories)
  const activeCategory = useBookmarksStore((s) => s.activeCategory)
  const setActiveCategory = useBookmarksStore((s) => s.setActiveCategory)
  const createCategory = useBookmarksStore((s) => s.createCategory)
  const removeCategory = useBookmarksStore((s) => s.removeCategory)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const countFor = (cat: string | null) =>
    cat === null
      ? items.length
      : items.filter((i) => i.category === cat).length

  const handleAdd = useCallback(() => {
    setAdding(true)
    setNewName('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  const handleCreateCommit = useCallback(async () => {
    const name = newName.trim().replace(/[/\\:*?"<>|]/g, '')
    if (name) {
      await createCategory(vaultFs, name)
      setActiveCategory(name)
    }
    setAdding(false)
    setNewName('')
  }, [newName, vaultFs, createCategory, setActiveCategory])

  const handleDeleteCategory = useCallback(
    (e: React.MouseEvent, name: string) => {
      e.stopPropagation()
      void removeCategory(vaultFs, name)
    },
    [vaultFs, removeCategory],
  )

  return (
    <div className="flex h-full w-48 shrink-0 flex-col overflow-y-auto">
      <div className="px-3 pt-3 pb-2">
        <h2 className="text-fg-muted text-[10px] font-semibold uppercase tracking-wider">
          Categories
        </h2>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={cn(
            'flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
            activeCategory === null
              ? 'bg-accent/10 text-accent font-medium'
              : 'text-fg-secondary hover:bg-bg-tertiary',
          )}
        >
          <span>All Bookmarks</span>
          <span className="text-fg-muted/50 text-[10px]">{countFor(null)}</span>
        </button>

        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'group flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
              activeCategory === cat
                ? 'bg-accent/10 text-accent font-medium'
                : 'text-fg-secondary hover:bg-bg-tertiary',
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              <FolderOpen className="size-3 shrink-0" />
              {cat}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-fg-muted/50 text-[10px]">{countFor(cat)}</span>
              {countFor(cat) === 0 && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteCategory(e, cat)}
                  className="text-fg-muted/30 hover:text-destructive hidden rounded p-0.5 group-hover:inline-flex"
                  aria-label={`Delete ${cat} category`}
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </span>
          </button>
        ))}

        {adding ? (
          <div className="px-1 py-1">
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => void handleCreateCommit()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateCommit()
                if (e.key === 'Escape') { setAdding(false); setNewName('') }
              }}
              placeholder="Category name"
              className="border-border bg-bg-secondary text-fg placeholder:text-fg-muted/40 w-full rounded-md border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-accent/40"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={handleAdd}
            className="text-fg-muted hover:text-fg hover:bg-bg-tertiary mt-1 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors"
          >
            <Plus className="size-3" />
            Add category
          </button>
        )}
      </nav>
    </div>
  )
}
