'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { fetchOgMetadata, type OgMetadata } from '@/lib/bookmarks/og-fetch'
import { useBookmarksStore } from '@/stores/bookmarks'
import type { BookmarkItem, BookmarkFrontmatter } from '@/types/bookmarks'

const NEW_CATEGORY_VALUE = '__new__'

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function AddBookmarkDialog({
  open,
  onOpenChange,
  editItem,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editItem?: BookmarkItem | null
}) {
  const { vaultFs } = useVaultSession()
  const addBookmark = useBookmarksStore((s) => s.addBookmark)
  const updateBookmark = useBookmarksStore((s) => s.updateBookmark)
  const moveToCategory = useBookmarksStore((s) => s.moveToCategory)
  const categories = useBookmarksStore((s) => s.categories)

  const isEdit = !!editItem

  // step: 'url' = first step (URL entry), 'details' = second step (full form)
  const [step, setStep] = useState<'url' | 'details'>('url')

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [category, setCategory] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [ogMeta, setOgMeta] = useState<OgMetadata | null>(null)
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)

  const urlRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const newCatRef = useRef<HTMLInputElement>(null)
  const isNewCategory = category === NEW_CATEGORY_VALUE

  // Reset when dialog opens/closes
  useEffect(() => {
    if (open && editItem) {
      setStep('details')
      setUrl(editItem.url)
      setTitle(editItem.title)
      setDescription(editItem.description)
      setTags(editItem.tags.join(', '))
      setCategory(editItem.category ?? '')
      setNewCategoryName('')
      setOgMeta({
        title: editItem.title,
        description: editItem.description,
        ogImage: editItem.ogImage,
        favicon: editItem.favicon,
      })
    } else if (open) {
      setStep('url')
      setUrl('')
      setTitle('')
      setDescription('')
      setTags('')
      setCategory('')
      setNewCategoryName('')
      setOgMeta(null)
    }
  }, [open, editItem])

  useEffect(() => {
    if (isNewCategory) setTimeout(() => newCatRef.current?.focus(), 0)
  }, [isNewCategory])

  const handleNext = useCallback(async () => {
    const normalized = normalizeUrl(url)
    if (!normalized) return
    setUrl(normalized)
    setFetching(true)
    setStep('details')
    try {
      const meta = await fetchOgMetadata(normalized)
      setOgMeta(meta)
      setTitle((prev) => prev || meta.title)
      setDescription((prev) => prev || meta.description)
    } catch { /* ignore */ }
    setFetching(false)
    setTimeout(() => titleRef.current?.focus(), 0)
  }, [url])

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); void handleNext() }
    },
    [handleNext],
  )

  const handleBack = useCallback(() => {
    setStep('url')
    setOgMeta(null)
    setTitle('')
    setTimeout(() => urlRef.current?.focus(), 0)
  }, [])

  const handleSave = useCallback(async () => {
    if (!url.trim()) return
    setSaving(true)

    const tagList = tags
      .split(/[,\s]+/)
      .map((t) => t.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean)

    const resolvedCategory = isNewCategory
      ? newCategoryName.trim() || null
      : category || null

    if (isEdit && editItem) {
      const fields: Partial<BookmarkFrontmatter> = {
        url,
        title: title || domainFromUrl(url),
        description,
        tags: tagList,
      }
      await updateBookmark(vaultFs, editItem.path, fields)
      // Move to new category if it changed
      if (resolvedCategory !== editItem.category) {
        await moveToCategory(vaultFs, editItem.path, resolvedCategory)
      }
    } else {
      const meta: Partial<BookmarkFrontmatter> = {
        title: title || ogMeta?.title || domainFromUrl(url),
        description: description || ogMeta?.description || '',
        tags: tagList,
      }
      await addBookmark(vaultFs, url, meta, resolvedCategory)
    }

    setSaving(false)
    onOpenChange(false)
  }, [
    url, title, description, tags, category, newCategoryName, isNewCategory,
    isEdit, editItem, ogMeta, vaultFs,
    addBookmark, updateBookmark, moveToCategory, onOpenChange,
  ])

  const handleFormKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void handleSave()
      }
    },
    [handleSave],
  )

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />

        {/* Step 1 — URL entry */}
        {step === 'url' && !isEdit && (
          <Dialog.Content
            className="bg-bg border-border fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-xl"
            onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => urlRef.current?.focus(), 0) }}
          >
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-fg text-sm font-semibold">Add Bookmark</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="text-fg-muted hover:text-fg rounded-md p-1" aria-label="Close">
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>

            <input
              ref={urlRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              placeholder="Paste a URL"
              className="border-border bg-bg-secondary text-fg placeholder:text-fg-muted/40 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent/40"
            />

            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                onClick={() => void handleNext()}
                disabled={!url.trim()}
              >
                Next
              </Button>
            </div>
          </Dialog.Content>
        )}

        {/* Step 2 — Details form */}
        {(step === 'details' || isEdit) && (
          <Dialog.Content
            className="bg-bg border-border fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-xl"
            onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => titleRef.current?.focus(), 0) }}
            onKeyDown={handleFormKeyDown}
          >
            <div className="mb-4 flex items-center gap-2">
              {!isEdit && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-fg-muted hover:text-fg rounded-md p-1 transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <Dialog.Title className="text-fg flex-1 text-sm font-semibold">
                {isEdit ? 'Edit Bookmark' : 'Add Bookmark'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="text-fg-muted hover:text-fg rounded-md p-1" aria-label="Close">
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex flex-col gap-3">
              {/* OG preview card */}
              {fetching ? (
                <div className="border-border bg-bg-secondary flex items-center gap-3 rounded-lg border p-3">
                  <Loader2 className="text-fg-muted size-4 animate-spin" />
                  <span className="text-fg-muted text-xs">Fetching page info…</span>
                </div>
              ) : ogMeta && (
                <div className="border-border bg-bg-secondary flex gap-3 rounded-lg border p-3">
                  {ogMeta.favicon && (
                    <img src={ogMeta.favicon} alt="" className="mt-0.5 size-5 shrink-0 rounded-sm" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-fg truncate text-xs font-semibold">{ogMeta.title}</p>
                    <p className="text-fg-muted/60 truncate text-[11px]">{domainFromUrl(url)}</p>
                  </div>
                  {ogMeta.ogImage && (
                    <img src={ogMeta.ogImage} alt="" className="h-10 w-16 shrink-0 rounded-md object-cover" />
                  )}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="text-fg-secondary mb-1 block text-xs font-medium">Title</label>
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={ogMeta?.title || 'Title'}
                  className="border-border bg-bg-secondary text-fg placeholder:text-fg-muted/40 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent/40"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-fg-secondary mb-1 block text-xs font-medium">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={ogMeta?.description || 'Optional note or description'}
                  rows={2}
                  className="border-border bg-bg-secondary text-fg placeholder:text-fg-muted/40 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent/40"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="text-fg-secondary mb-1 block text-xs font-medium">Tags</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="tech, reading, design"
                  className="border-border bg-bg-secondary text-fg placeholder:text-fg-muted/40 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent/40"
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-fg-secondary mb-1 block text-xs font-medium">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="border-border bg-bg-secondary text-fg w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent/40"
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value={NEW_CATEGORY_VALUE}>+ New category…</option>
                </select>
                {isNewCategory && (
                  <input
                    ref={newCatRef}
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="border-border bg-bg-secondary text-fg placeholder:text-fg-muted/40 mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent/40"
                  />
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm">Cancel</Button>
              </Dialog.Close>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={!url.trim() || saving || fetching}
              >
                {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                {isEdit ? 'Save' : 'Add'}
              </Button>
            </div>
          </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  )
}
