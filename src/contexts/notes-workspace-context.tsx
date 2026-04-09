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
import { collectMarkdownPaths } from '@/lib/notes/collect-markdown-paths'

export type NotesWorkspaceValueContext = {
  markdownPaths: string[]
  refreshMarkdownPaths: () => Promise<void>
}

const NotesWorkspaceContext = createContext<NotesWorkspaceValueContext | null>(null)

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
    void collectMarkdownPaths(vaultFs).then((paths) => {
      if (!cancelled) setMarkdownPaths(paths)
    })
    return () => {
      cancelled = true
    }
  }, [vaultFs])

  const refreshMarkdownPaths = useCallback(async () => {
    setMarkdownPaths(await collectMarkdownPaths(vaultFs))
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
