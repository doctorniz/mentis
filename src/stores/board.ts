import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { BoardItem, ThoughtColor } from '@/types/board'
import {
  BOARD_DIR,
  parseBoardItem,
  serializeBoardItem,
  generateBoardFilename,
  defaultFrontmatter,
} from '@/lib/board'

interface BoardState {
  items: BoardItem[]
  loading: boolean
  activeItemPath: string | null

  loadBoard: (fs: FileSystemAdapter) => Promise<void>
  addThought: (fs: FileSystemAdapter, color?: ThoughtColor) => Promise<BoardItem>
  updateItem: (fs: FileSystemAdapter, path: string, body: string) => Promise<void>
  removeItem: (fs: FileSystemAdapter, path: string) => Promise<void>
  setActiveItem: (path: string | null) => void
}

export const useBoardStore = create<BoardState>()(
  immer((set, get) => ({
    items: [],
    loading: false,
    activeItemPath: null,

    loadBoard: async (fs) => {
      set((s) => { s.loading = true })
      try {
        const exists = await fs.exists(BOARD_DIR)
        if (!exists) {
          await fs.mkdir(BOARD_DIR)
          set((s) => { s.items = []; s.loading = false })
          return
        }

        const entries = await fs.readdir(BOARD_DIR)
        const mdFiles = entries.filter((e) => !e.isDirectory && e.name.endsWith('.md'))

        const items: BoardItem[] = []
        for (const entry of mdFiles) {
          try {
            const raw = await fs.readTextFile(entry.path)
            items.push(parseBoardItem(entry.path, raw))
          } catch {
            // skip unreadable files
          }
        }

        items.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
        set((s) => { s.items = items; s.loading = false })
      } catch {
        set((s) => { s.loading = false })
      }
    },

    addThought: async (fs, color) => {
      const exists = await fs.exists(BOARD_DIR)
      if (!exists) await fs.mkdir(BOARD_DIR)

      const filename = generateBoardFilename()
      const path = `${BOARD_DIR}/${filename}`
      const fm = defaultFrontmatter(color)
      const raw = serializeBoardItem(fm, '\n')
      await fs.writeTextFile(path, raw)

      const item = parseBoardItem(path, raw)
      set((s) => {
        s.items.unshift(item)
        s.activeItemPath = path
      })
      return item
    },

    updateItem: async (fs, path, body) => {
      const state = get()
      const existing = state.items.find((i) => i.path === path)
      if (!existing) return

      const fm = defaultFrontmatter(existing.color)
      fm.created = existing.created
      const raw = serializeBoardItem(fm, body)
      await fs.writeTextFile(path, raw)

      const updated = parseBoardItem(path, raw)
      set((s) => {
        const idx = s.items.findIndex((i) => i.path === path)
        if (idx !== -1) s.items[idx] = updated
      })
    },

    removeItem: async (fs, path) => {
      try { await fs.remove(path) } catch { /* already gone */ }
      set((s) => {
        s.items = s.items.filter((i) => i.path !== path)
        if (s.activeItemPath === path) s.activeItemPath = null
      })
    },

    setActiveItem: (path) =>
      set((s) => { s.activeItemPath = path }),
  })),
)
