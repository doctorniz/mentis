import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { BoardItem, ThoughtColor } from '@/types/board'
import {
  BOARD_DIR,
  BOARD_ASSETS_DIR,
  parseBoardItem,
  serializeBoardItem,
  generateBoardFilename,
  defaultFrontmatter,
  extractBoardVaultImagePaths,
  boardBodyIsImageOnly,
  boardExportBasenamePreferTitle,
} from '@/lib/board'

async function uniquifyVaultBasename(fs: FileSystemAdapter, basename: string): Promise<string> {
  if (!(await fs.exists(basename))) return basename
  const extMatch = /\.[^.]+$/i.exec(basename)
  const ext = extMatch ? extMatch[0] : ''
  const stem = ext ? basename.slice(0, -ext.length) : basename
  let suffix = 1
  let candidate = `${stem} (${suffix})${ext}`
  while (await fs.exists(candidate)) {
    suffix++
    candidate = `${stem} (${suffix})${ext}`
  }
  return candidate
}

interface BoardState {
  items: BoardItem[]
  loading: boolean
  activeItemPath: string | null

  loadBoard: (fs: FileSystemAdapter) => Promise<void>
  addThought: (fs: FileSystemAdapter, color?: ThoughtColor) => Promise<BoardItem>
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

    addAudioThought: async (fs, audioBytes, durationMs, color, mimeType) => {
      // Ensure assets dir exists
      const assetsExist = await fs.exists(BOARD_ASSETS_DIR)
      if (!assetsExist) await fs.mkdir(BOARD_ASSETS_DIR)

      // Derive file extension from MIME type (fallback to mp3)
      const ext = mimeType?.includes('mp4') ? 'mp4'
        : mimeType?.includes('ogg') ? 'ogg'
        : mimeType?.includes('webm') ? 'webm'
        : 'mp3'

      // Save audio to assets
      const ts = Date.now().toString(36)
      const rand = Math.random().toString(36).slice(2, 6)
      const assetName = `${ts}-${rand}.${ext}`
      const audioPath = `${BOARD_ASSETS_DIR}/${assetName}`
      await fs.writeFile(audioPath, audioBytes)

      // Create board .md file with audio frontmatter
      const boardExists = await fs.exists(BOARD_DIR)
      if (!boardExists) await fs.mkdir(BOARD_DIR)

      const filename = generateBoardFilename()
      const path = `${BOARD_DIR}/${filename}`
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
      try { await fs.remove(path) } catch { /* already gone */ }
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
            typeof item.audioPath === 'string' ? item.audioPath
            : typeof fm.audioPath === 'string' ? fm.audioPath
            : null
          if (
            !audioRel ||
            !audioRel.startsWith(`${BOARD_ASSETS_DIR}/`)
          ) {
            console.error('Board audio item missing asset path')
            return null
          }
          const bytes = await fs.readFile(audioRel)
          const assetFile = audioRel.split('/').pop() ?? 'recording.mp3'
          const extMatch = /\.[^.]+$/i.exec(assetFile)
          const extWithDot = extMatch ? extMatch[0] : '.mp3'
          const base = boardExportBasenamePreferTitle(item.title, assetFile, extWithDot)
          const destPath = await uniquifyVaultBasename(fs, base)
          await fs.writeFile(destPath, bytes)
          try { await fs.remove(audioRel) } catch { /* noop */ }
          try { await fs.remove(path) } catch { /* noop */ }
          return finalize(destPath)
        }

        // Image-only card (one board asset, headings/whitespace only) → vault root image file
        const boardImagePaths = extractBoardVaultImagePaths(content).filter((p) =>
          p.startsWith(`${BOARD_ASSETS_DIR}/`),
        )
        if (
          boardImagePaths.length === 1 &&
          boardBodyIsImageOnly(content) &&
          !fm.audioPath
        ) {
          const imgPath = boardImagePaths[0]
          const bytes = await fs.readFile(imgPath)
          const assetFile = imgPath.split('/').pop() ?? 'image.png'
          const extMatch = /\.[^.]+$/i.exec(assetFile)
          const extWithDot = extMatch ? extMatch[0] : '.png'
          const base = boardExportBasenamePreferTitle(item.title, assetFile, extWithDot)
          const destPath = await uniquifyVaultBasename(fs, base)
          await fs.writeFile(destPath, bytes)
          try { await fs.remove(imgPath) } catch { /* noop */ }
          try { await fs.remove(path) } catch { /* noop */ }
          return finalize(destPath)
        }

        // Markdown note (incl. thoughts with real text and/or multiple images)
        const srcName = path.split('/').pop() ?? 'thought.md'
        const title = item.title?.replace(/[/\\:*?"<>|]/g, '_').trim()
        let destName = title ? `${title}.md` : srcName
        if (title && destName !== srcName && (await fs.exists(destName))) {
          destName = srcName
        }
        let destPath = destName
        let suffix = 1
        while (await fs.exists(destPath)) {
          const stem = destName.replace(/\.md$/i, '')
          destPath = `${stem} (${suffix}).md`
          suffix++
        }

        let updatedContent = content
        const assetRe = /(_marrow\/_board\/_assets\/[^\s)]+)/g
        const assetMatches = [...raw.matchAll(assetRe)]
        const assetDir = '_assets'
        if (assetMatches.length > 0) {
          const dirExists = await fs.exists(assetDir)
          if (!dirExists) await fs.mkdir(assetDir)
        }
        for (const match of assetMatches) {
          const oldAssetPath = match[1]
          const assetFilename = oldAssetPath.split('/').pop() ?? ''
          const newAssetPath = `${assetDir}/${assetFilename}`
          try {
            const assetBytes = await fs.readFile(oldAssetPath)
            await fs.writeFile(newAssetPath, assetBytes)
            await fs.remove(oldAssetPath)
          } catch { /* asset may already be moved or missing */ }
          updatedContent = updatedContent.replaceAll(oldAssetPath, newAssetPath)
          if (fm.audioPath === oldAssetPath) fm.audioPath = newAssetPath
        }

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

        const newRaw = matterLib.stringify(updatedContent, vaultFm)
        await fs.writeTextFile(destPath, newRaw)

        try { await fs.remove(path) } catch { /* already gone */ }

        return finalize(destPath)
      } catch (e) {
        console.error('Failed to move board item to vault:', e)
        return null
      }
    },

    setActiveItem: (path) =>
      set((s) => { s.activeItemPath = path }),
  })),
)
