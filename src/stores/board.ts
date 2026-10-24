import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { uniqueVaultPath } from '@/lib/fs/unique-path'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { BoardItem, ThoughtColor } from '@/types/board'
import { attachmentsDir } from '@/lib/vault/attachments-dir'
import { useVaultStore } from '@/stores/vault'
import {
  thoughtsDir,
  thoughtFilename,
  parseBoardItem,
  serializeBoardItem,
  defaultFrontmatter,
  extractBoardVaultImagePaths,
  boardBodyIsImageOnly,
  boardExportBasenamePreferTitle,
} from '@/lib/board'

interface BoardState {
  items: BoardItem[]
  loading: boolean
  activeItemPath: string | null

  loadBoard: (fs: FileSystemAdapter) => Promise<void>
  /** A new thought, opened for editing. `body` starts it with text (and names it). */
  addThought: (fs: FileSystemAdapter, color?: ThoughtColor, body?: string) => Promise<BoardItem>
  /** Save a thought that already has its text (capture), without opening it for editing. */
  captureThought: (fs: FileSystemAdapter, text: string) => Promise<BoardItem>
  addAudioThought: (
    fs: FileSystemAdapter,
    audioBytes: Uint8Array,
    durationMs: number,
    color?: ThoughtColor,
    mimeType?: string,
  ) => Promise<BoardItem>
  updateItem: (fs: FileSystemAdapter, path: string, body: string) => Promise<void>
  /** Update frontmatter fields on a board item (e.g. transcript). */
  updateItemMeta: (
    fs: FileSystemAdapter,
    path: string,
    meta: Record<string, unknown>,
  ) => Promise<void>
  removeItem: (fs: FileSystemAdapter, path: string) => Promise<void>
  /** Move a board item to the vault root. Returns the new vault path. */
  moveToVault: (fs: FileSystemAdapter, path: string) => Promise<string | null>
  setActiveItem: (path: string | null) => void
}

const currentConfig = () => useVaultStore.getState().config

/** A free path in the Thoughts folder for a thought that says `text`. */
async function newThoughtPath(fs: FileSystemAdapter, text: string): Promise<string> {
  const dir = thoughtsDir(currentConfig())
  await fs.mkdir(dir)
  return uniqueVaultPath(fs, `${dir}/${thoughtFilename(text)}`)
}

export const useBoardStore = create<BoardState>()(
  immer((set, get) => ({
    items: [],
    loading: false,
    activeItemPath: null,

    loadBoard: async (fs) => {
      set((s) => {
        s.loading = true
      })
      try {
        const dir = thoughtsDir(currentConfig())
        const exists = await fs.exists(dir)
        if (!exists) {
          await fs.mkdir(dir)
          set((s) => {
            s.items = []
            s.loading = false
          })
          return
        }

        const entries = await fs.readdir(dir)
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
        set((s) => {
          s.items = items
          s.loading = false
        })
      } catch {
        set((s) => {
          s.loading = false
        })
      }
    },

    addThought: async (fs, color, body = '\n') => {
      const path = await newThoughtPath(fs, body)
      const fm = defaultFrontmatter(color)
      const raw = serializeBoardItem(fm, body)
      await fs.writeTextFile(path, raw)

      const item = parseBoardItem(path, raw)
      set((s) => {
        s.items.unshift(item)
        s.activeItemPath = path
      })
      return item
    },

    captureThought: async (fs, text) => {
      const path = await newThoughtPath(fs, text)
      const raw = serializeBoardItem(defaultFrontmatter(), `${text}\n`)
      await fs.writeTextFile(path, raw)

      const item = parseBoardItem(path, raw)
      set((s) => {
        s.items.unshift(item)
      })
      return item
    },

    addAudioThought: async (fs, audioBytes, durationMs, color, mimeType) => {
      // Derive file extension from MIME type (fallback to mp3)
      const ext = mimeType?.includes('mp4')
        ? 'mp4'
        : mimeType?.includes('ogg')
          ? 'ogg'
          : mimeType?.includes('webm')
            ? 'webm'
            : 'mp3'

      // Loaded here, not up front: the board store is in the initial bundle.
      const { saveAsset } = await import('@/lib/notes/assets')
      const audioPath = await saveAsset(
        fs,
        `recording.${ext}`,
        audioBytes,
        attachmentsDir(currentConfig()),
      )

      const path = await newThoughtPath(fs, 'Voice note')
      const now = new Date().toISOString()
      const durationSec = Math.round(durationMs / 1000)
      const fm = {
        type: 'audio' as const,
        created: now,
        modified: now,
        color: color ?? ('white' as ThoughtColor),
        audioPath,
        audioDuration: durationSec,
      }
      const titleLine = `Voice Note ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      const body = `\n# ${titleLine}\n`
      const raw = serializeBoardItem(fm, body)
      await fs.writeTextFile(path, raw)

      const item = parseBoardItem(path, raw)
      set((s) => {
        s.items.unshift(item)
      })
      return item
    },

    updateItem: async (fs, path, body) => {
      const state = get()
      const existing = state.items.find((i) => i.path === path)
      if (!existing) return

      try {
        const prevRaw = await fs.readTextFile(path)
        const matter = await import('gray-matter').then((m) => m.default)
        const parsed = matter(prevRaw)
        const fm = {
          ...(parsed.data as Record<string, unknown>),
          modified: new Date().toISOString(),
          color: existing.color,
        }
        const raw = matter.stringify(body, fm)
        await fs.writeTextFile(path, raw)

        const updated = parseBoardItem(path, raw)
        set((s) => {
          const idx = s.items.findIndex((i) => i.path === path)
          if (idx !== -1) s.items[idx] = updated
        })
      } catch (e) {
        console.error('Failed to update board item:', e)
      }
    },

    updateItemMeta: async (fs, path, meta) => {
      const state = get()
      const existing = state.items.find((i) => i.path === path)
      if (!existing) return

      // Read current file, update frontmatter, rewrite
      try {
        const raw = await fs.readTextFile(path)
        const matter = await import('gray-matter').then((m) => m.default)
        const { data, content } = matter(raw)
        const updated = { ...data, ...meta, modified: new Date().toISOString() }
        const newRaw = matter.stringify(content, updated)
        await fs.writeTextFile(path, newRaw)

        const item = parseBoardItem(path, newRaw)
        set((s) => {
          const idx = s.items.findIndex((i) => i.path === path)
          if (idx !== -1) s.items[idx] = item
        })
      } catch (e) {
        console.error('Failed to update board item meta:', e)
      }
    },

    removeItem: async (fs, path) => {
      try {
        await fs.remove(path)
      } catch {
        /* already gone */
      }
      set((s) => {
        s.items = s.items.filter((i) => i.path !== path)
        if (s.activeItemPath === path) s.activeItemPath = null
      })
    },

    moveToVault: async (fs, path) => {
      const state = get()
      const item = state.items.find((i) => i.path === path)
      if (!item) return null

      const finalize = (destPath: string) => {
        set((s) => {
          s.items = s.items.filter((i) => i.path !== path)
          if (s.activeItemPath === path) s.activeItemPath = null
        })
        window.dispatchEvent(new CustomEvent('ink:vault-changed'))
        return destPath
      }

      try {
        const raw = await fs.readTextFile(path)
        const matterLib = await import('gray-matter').then((m) => m.default)
        const { data, content } = matterLib(raw)
        const fm = data as Record<string, unknown>

        // Voice note → vault root audio file (not a markdown attachment card)
        if (item.type === 'audio' || fm.type === 'audio') {
          const audioRel =
            typeof item.audioPath === 'string'
              ? item.audioPath
              : typeof fm.audioPath === 'string'
                ? fm.audioPath
                : null
          if (!audioRel) {
            console.error('Board audio item missing asset path')
            return null
          }
          const bytes = await fs.readFile(audioRel)
          const assetFile = audioRel.split('/').pop() ?? 'recording.mp3'
          const extMatch = /\.[^.]+$/i.exec(assetFile)
          const extWithDot = extMatch ? extMatch[0] : '.mp3'
          const base = boardExportBasenamePreferTitle(item.title, assetFile, extWithDot)
          const destPath = await uniqueVaultPath(fs, base)
          await fs.writeFile(destPath, bytes)
          try {
            await fs.remove(audioRel)
          } catch {
            /* noop */
          }
          try {
            await fs.remove(path)
          } catch {
            /* noop */
          }
          return finalize(destPath)
        }

        // Image-only card (one attachment, headings/whitespace only) → vault root image file
        const attachments = attachmentsDir(currentConfig())
        const boardImagePaths = extractBoardVaultImagePaths(content).filter((p) =>
          p.startsWith(`${attachments}/`),
        )
        if (boardImagePaths.length === 1 && boardBodyIsImageOnly(content) && !fm.audioPath) {
          const imgPath = boardImagePaths[0]
          const bytes = await fs.readFile(imgPath)
          const assetFile = imgPath.split('/').pop() ?? 'image.png'
          const extMatch = /\.[^.]+$/i.exec(assetFile)
          const extWithDot = extMatch ? extMatch[0] : '.png'
          const base = boardExportBasenamePreferTitle(item.title, assetFile, extWithDot)
          const destPath = await uniqueVaultPath(fs, base)
          await fs.writeFile(destPath, bytes)
          try {
            await fs.remove(imgPath)
          } catch {
            /* noop */
          }
          try {
            await fs.remove(path)
          } catch {
            /* noop */
          }
          return finalize(destPath)
        }

        // Markdown note (incl. thoughts with real text and/or multiple images)
        const srcName = path.split('/').pop() ?? 'thought.md'
        const title = item.title?.replace(/[/\\:*?"<>|]/g, '_').trim()
        let destName = title ? `${title}.md` : srcName
        if (title && destName !== srcName && (await fs.exists(destName))) {
          destName = srcName
        }
        const destPath = await uniqueVaultPath(fs, destName)

        // Its images and recordings are already in the attachment folder.
        const vaultFm: Record<string, unknown> = {
          title: item.title ?? undefined,
          created: fm.created,
          modified: new Date().toISOString(),
        }
        if (fm.audioPath) {
          vaultFm.type = 'audio'
          vaultFm.audioPath = fm.audioPath
        }
        if (fm.audioDuration != null) vaultFm.audioDuration = fm.audioDuration
        if (fm.transcript) vaultFm.transcript = fm.transcript
        if (fm.tags) vaultFm.tags = fm.tags

        const newRaw = matterLib.stringify(content, vaultFm)
        await fs.writeTextFile(destPath, newRaw)

        try {
          await fs.remove(path)
        } catch {
          /* already gone */
        }

        return finalize(destPath)
      } catch (e) {
        console.error('Failed to move board item to vault:', e)
        return null
      }
    },

    setActiveItem: (path) =>
      set((s) => {
        s.activeItemPath = path
      }),
  })),
)
