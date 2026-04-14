'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { FileSystemAdapter } from '@/lib/fs'
import { Button } from '@/components/ui/button'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { removeSearchDocument } from '@/lib/search/index'
import { reindexMarkdownPath } from '@/lib/search/build-vault-index'
import { vaultPathsPointToSameFile } from '@/lib/fs/vault-path-equiv'

function parentDir(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

function titleFromPath(path: string): string {
  return path.replace(/\.md$/i, '').split('/').pop() ?? path
}

export function RenameNoteDialog({
  open,
  onOpenChange,
  vaultFs,
  currentPath,
  onRenamed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vaultFs: FileSystemAdapter
  currentPath: string
  onRenamed?: () => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const base = currentPath.split('/').pop() ?? ''
    setName(base.replace(/\.md$/i, ''))
    setError(null)
  }, [open, currentPath])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name.')
      return
    }
    if (/[/\\]/.test(trimmed)) {
      setError('Name cannot contain slashes.')
      return
    }
    const fileName = trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`
    const parent = parentDir(currentPath)
    const newPath = joinPath(parent, fileName)
    if (vaultPathsPointToSameFile(newPath, currentPath)) {
      onOpenChange(false)
      return
    }
    if ((await vaultFs.exists(newPath)) && !vaultPathsPointToSameFile(newPath, currentPath)) {
      setError('A note with that name already exists.')
      return
    }

    setBusy(true)
    try {
      await vaultFs.rename(currentPath, newPath)
      removeSearchDocument(currentPath)
      await reindexMarkdownPath(vaultFs, newPath)
      const newTitle = titleFromPath(newPath)
      const tabs = useEditorStore.getState().tabs
      for (const tab of tabs) {
        if (tab.path === currentPath) {
          useEditorStore.getState().retargetTabPath(tab.id, newPath, newTitle)
        }
      }
      const sel = useFileTreeStore.getState().selectedPath
      if (sel === currentPath) {
        useFileTreeStore.getState().setSelectedPath(newPath)
      }
      onRenamed?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[199] bg-black/40" />
        <Dialog.Content className="border-border-strong bg-bg fixed top-1/2 left-1/2 z-[200] w-[min(100%,360px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-4 shadow-lg">
          <Dialog.Title className="text-fg text-sm font-semibold">Rename note</Dialog.Title>
          <Dialog.Description className="text-fg-secondary mt-1 text-xs">
            Changes the file name in your vault (keeps <code className="text-fg">.md</code>).
          </Dialog.Description>
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3">
            <input
              type="text"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              aria-label="New note name"
              className="border-border-strong focus:border-accent focus:ring-accent/20 bg-bg text-fg w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              autoFocus
              disabled={busy}
            />
            {error && (
              <p className="text-danger text-xs" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Renaming…' : 'Rename'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
