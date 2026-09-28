'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { FileSystemAdapter } from '@/lib/fs'
import { fileTypes } from '@/core/registries'
import { collectMarkdownPaths } from '@/lib/notes/collect-markdown-paths'
import { getIndexManifest, whenSearchIndexOpen } from '@/lib/search/index'

export type NotesWorkspaceValueContext = {
  markdownPaths: string[]
  refreshMarkdownPaths: () => Promise<void>
}

const NotesWorkspaceContext = createContext<NotesWorkspaceValueContext | null>(null)

// A stable order: the filesystem lists entries in no particular order.
const byPath = (paths: string[]) => paths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

/**
 * Wiki-link targets (every `linkable` file). They come from the vault index's
 * manifest — no walk of the vault at launch — and are re-read whenever the
 * index finishes reconciling. After the user's own file operations the list is
 * re-collected from the vault, because a new note is not in the index until
 * its first save.
 */
async function linkTargetsFromIndex(): Promise<string[]> {
  await whenSearchIndexOpen()
  const manifest = await getIndexManifest()
  return byPath(manifest.map((e) => e.path).filter((p) => fileTypes.resolve(p)?.linkable))
}

export function NotesWorkspaceProvider({
  vaultFs,
  children,
}: {
  vaultFs: FileSystemAdapter
  children: ReactNode
}) {
  const [markdownPaths, setMarkdownPaths] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void linkTargetsFromIndex()
        .then((paths) => {
          if (!cancelled) setMarkdownPaths(paths)
        })
        .catch(() => {})
    }
    load()
    window.addEventListener('ink:search-index-reconciled', load)
    return () => {
      cancelled = true
      window.removeEventListener('ink:search-index-reconciled', load)
    }
  }, [vaultFs])

  const refreshMarkdownPaths = useCallback(async () => {
    setMarkdownPaths(byPath(await collectMarkdownPaths(vaultFs)))
  }, [vaultFs])

  const value = useMemo(
    () => ({ markdownPaths, refreshMarkdownPaths }),
    [markdownPaths, refreshMarkdownPaths],
  )

  return <NotesWorkspaceContext.Provider value={value}>{children}</NotesWorkspaceContext.Provider>
}

export function useNotesWorkspace(): NotesWorkspaceValueContext {
  const ctx = useContext(NotesWorkspaceContext)
  if (!ctx) {
    throw new Error('useNotesWorkspace must be used within NotesWorkspaceProvider')
  }
  return ctx
}
