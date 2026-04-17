import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { BookmarkItem, BookmarkFrontmatter } from '@/types/bookmarks'
import {
  BOOKMARKS_DIR,
  parseBookmarkItem,
  serializeBookmark,
  generateBookmarkFilename,
} from '@/lib/bookmarks'
import { fetchOgMetadata } from '@/lib/bookmarks/og-fetch'

interface BookmarksState {
  items: BookmarkItem[]
  categories: string[]
  activeCategory: string | null
  loading: boolean

  loadBookmarks: (fs: FileSystemAdapter) => Promise<void>
  addBookmark: (
    fs: FileSystemAdapter,
    url: string,
    meta?: Partial<BookmarkFrontmatter>,
    category?: string | null,
  ) => Promise<BookmarkItem>
  updateBookmark: (
    fs: FileSystemAdapter,
    path: string,
    fields: Partial<BookmarkFrontmatter>,
  ) => Promise<void>
  removeBookmark: (fs: FileSystemAdapter, path: string) => Promise<void>
  moveToCategory: (
    fs: FileSystemAdapter,
    path: string,
    newCategory: string | null,
  ) => Promise<void>
  createCategory: (fs: FileSystemAdapter, name: string) => Promise<void>
  removeCategory: (fs: FileSystemAdapter, name: string) => Promise<void>
  setActiveCategory: (category: string | null) => void
}

async function collectBookmarkFiles(
  fs: FileSystemAdapter,
  dir: string,
  acc: string[],
): Promise<void> {
  const entries = await fs.readdir(dir)
  for (const e of entries) {
    if (e.isDirectory) {
      await collectBookmarkFiles(fs, e.path, acc)
    } else if (e.name.endsWith('.md')) {
      acc.push(e.path)
    }
  }
}

async function collectCategories(fs: FileSystemAdapter): Promise<string[]> {
  const entries = await fs.readdir(BOOKMARKS_DIR)
  return entries.filter((e) => e.isDirectory).map((e) => e.name)
}

export const useBookmarksStore = create<BookmarksState>()(
  immer((set) => ({
    items: [],
    categories: [],
    activeCategory: null,
    loading: false,

    loadBookmarks: async (fs) => {
      set((s) => { s.loading = true })
      try {
        const exists = await fs.exists(BOOKMARKS_DIR)
        if (!exists) {
          await fs.mkdir(BOOKMARKS_DIR)
          set((s) => { s.items = []; s.categories = []; s.loading = false })
          return
        }

        const paths: string[] = []
        await collectBookmarkFiles(fs, BOOKMARKS_DIR, paths)

        const items: BookmarkItem[] = []
        for (const p of paths) {
          try {
            const raw = await fs.readTextFile(p)
            items.push(parseBookmarkItem(p, raw))
          } catch { /* skip unreadable */ }
        }
        items.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())

        const cats = await collectCategories(fs)
        set((s) => { s.items = items; s.categories = cats; s.loading = false })
      } catch {
        set((s) => { s.loading = false })
      }
    },

    addBookmark: async (fs, url, meta, category) => {
      const exists = await fs.exists(BOOKMARKS_DIR)
      if (!exists) await fs.mkdir(BOOKMARKS_DIR)

      const dir = category ? `${BOOKMARKS_DIR}/${category}` : BOOKMARKS_DIR
      if (category) {
        const catExists = await fs.exists(dir)
        if (!catExists) await fs.mkdir(dir)
      }

      const og = await fetchOgMetadata(url)

      const now = new Date().toISOString()
      const fm: BookmarkFrontmatter = {
        url,
        title: meta?.title || og.title,
        description: meta?.description ?? og.description,
        favicon: og.favicon,
        ogImage: og.ogImage,
        tags: meta?.tags ?? [],
        created: now,
        modified: now,
      }

      const filename = generateBookmarkFilename()
      const path = `${dir}/${filename}`
      const raw = serializeBookmark(fm)
      await fs.writeTextFile(path, raw)

      const item = parseBookmarkItem(path, raw)
      set((s) => {
        s.items.unshift(item)
        if (category && !s.categories.includes(category)) {
          s.categories.push(category)
          s.categories.sort()
        }
      })
      return item
    },

    updateBookmark: async (fs, path, fields) => {
      let idx = -1
      let existing: BookmarkItem | undefined
      set((s) => {
        idx = s.items.findIndex((i) => i.path === path)
        if (idx !== -1) existing = { ...s.items[idx] } as BookmarkItem
      })
      if (!existing) return

      const fm: BookmarkFrontmatter = {
        url: fields.url ?? existing.url,
        title: fields.title ?? existing.title,
        description: fields.description ?? existing.description,
        favicon: fields.favicon ?? existing.favicon,
        ogImage: fields.ogImage ?? existing.ogImage,
        tags: fields.tags ?? existing.tags,
        created: existing.created,
        modified: new Date().toISOString(),
      }

      const raw = serializeBookmark(fm)
      await fs.writeTextFile(path, raw)

      const updated = parseBookmarkItem(path, raw)
      set((s) => {
        const i = s.items.findIndex((it) => it.path === path)
        if (i !== -1) s.items[i] = updated
      })
    },

    removeBookmark: async (fs, path) => {
      try { await fs.remove(path) } catch { /* already gone */ }
      set((s) => { s.items = s.items.filter((i) => i.path !== path) })
    },

    moveToCategory: async (fs, path, newCategory) => {
      const dir = newCategory ? `${BOOKMARKS_DIR}/${newCategory}` : BOOKMARKS_DIR
      if (newCategory) {
        const catExists = await fs.exists(dir)
        if (!catExists) await fs.mkdir(dir)
      }

      const filename = path.split('/').pop()!
      const newPath = `${dir}/${filename}`
      if (newPath === path) return

      await fs.rename(path, newPath)

      set((s) => {
        const item = s.items.find((i) => i.path === path)
        if (item) {
          item.path = newPath
          item.category = newCategory || null
        }
        if (newCategory && !s.categories.includes(newCategory)) {
          s.categories.push(newCategory)
          s.categories.sort()
        }
      })
    },

    createCategory: async (fs, name) => {
      const dir = `${BOOKMARKS_DIR}/${name}`
      await fs.mkdir(dir)
      set((s) => {
        if (!s.categories.includes(name)) {
          s.categories.push(name)
          s.categories.sort()
        }
      })
    },

    removeCategory: async (fs, name) => {
      const dir = `${BOOKMARKS_DIR}/${name}`
      try { await fs.removeDir(dir) } catch { /* ignore */ }
      set((s) => {
        s.categories = s.categories.filter((c) => c !== name)
        s.items = s.items.filter((i) => i.category !== name)
        if (s.activeCategory === name) s.activeCategory = null
      })
    },

    setActiveCategory: (category) =>
      set((s) => { s.activeCategory = category }),
  })),
)
