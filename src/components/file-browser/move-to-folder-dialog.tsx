'use client'

import { useCallback, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronRight, ChevronDown, Folder, FolderPlus, X } from 'lucide-react'
import type { FileSystemAdapter } from '@/lib/fs'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

interface FolderNode {
  name: string
  path: string
  children: FolderNode[] | null
  expanded: boolean
}

async function loadFolders(vaultFs: FileSystemAdapter, dir: string): Promise<FolderNode[]> {
  const entries = await vaultFs.readdir(dir)
  return entries
    .filter((e) => e.isDirectory && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ name: e.name, path: e.path, children: null, expanded: false }))
}

function FolderRow({
  node,
  depth,
  selected,
  onSelect,
  onToggle,
}: {
  node: FolderNode
  depth: number
  selected: string
  onSelect: (path: string) => void
  onToggle: (path: string) => void
}) {
  const isSelected = selected === node.path
  const hasChildren = node.children === null || node.children.length > 0

  return (
    <>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
          isSelected
            ? 'bg-accent/15 text-accent font-medium'
            : 'text-fg-secondary hover:bg-bg-tertiary',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.path)}
        onDoubleClick={() => onToggle(node.path)}
      >
        {hasChildren ? (
          <button
            type="button"
            className="shrink-0 rounded p-0.5 hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); onToggle(node.path) }}
            aria-label={node.expanded ? 'Collapse' : 'Expand'}
          >
            {node.expanded
              ? <ChevronDown className="size-3.5" />
              : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        <Folder className="size-4 shrink-0 text-amber-500/80" />
        <span className="truncate">{node.name}</span>
      </button>

      {node.expanded && node.children?.map((child) => (
        <FolderRow
          key={child.path}
          node={child}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </>
  )
}

export function MoveToFolderDialog({
  open,
  onOpenChange,
  vaultFs,
  itemNames,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vaultFs: FileSystemAdapter
  itemNames: string[]
  onConfirm: (destFolder: string) => void
}) {
  const [tree, setTree] = useState<FolderNode[]>([])
  const [selected, setSelected] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected('')
    setNewFolderName('')
    setShowNewFolder(false)
    void loadFolders(vaultFs, '').then(setTree)
  }, [open, vaultFs])

  const toggleFolder = useCallback(async (path: string) => {
    setTree((prev) => {
      const update = (nodes: FolderNode[]): FolderNode[] =>
        nodes.map((n) => {
          if (n.path === path) {
            return { ...n, expanded: !n.expanded }
          }
          if (n.children) {
            return { ...n, children: update(n.children) }
          }
          return n
        })
      return update(prev)
    })

    const target = findNode(tree, path)
    if (target && target.children === null) {
      const children = await loadFolders(vaultFs, path)
      setTree((prev) => {
        const update = (nodes: FolderNode[]): FolderNode[] =>
          nodes.map((n) => {
            if (n.path === path) return { ...n, children, expanded: true }
            if (n.children) return { ...n, children: update(n.children) }
            return n
          })
        return update(prev)
      })
    }
  }, [tree, vaultFs])

  function findNode(nodes: FolderNode[], path: string): FolderNode | undefined {
    for (const n of nodes) {
      if (n.path === path) return n
      if (n.children) {
        const found = findNode(n.children, path)
        if (found) return found
      }
    }
    return undefined
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim().replace(/[/\\:*?"<>|]/g, '')
    if (!name) return
    const parentPath = selected || ''
    const folderPath = parentPath ? `${parentPath}/${name}` : name
    await vaultFs.mkdir(folderPath)
    if (selected) {
      const children = await loadFolders(vaultFs, selected)
      setTree((prev) => {
        const update = (nodes: FolderNode[]): FolderNode[] =>
          nodes.map((n) => {
            if (n.path === selected) return { ...n, children, expanded: true }
            if (n.children) return { ...n, children: update(n.children) }
            return n
          })
        return update(prev)
      })
    } else {
      setTree(await loadFolders(vaultFs, ''))
    }
    setSelected(folderPath)
    setNewFolderName('')
    setShowNewFolder(false)
  }

  function handleConfirm() {
    setBusy(true)
    onConfirm(selected)
    onOpenChange(false)
    setBusy(false)
  }

  const label = itemNames.length === 1
    ? `Move "${itemNames[0]}"`
    : `Move ${itemNames.length} items`

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="border-border bg-bg fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border shadow-2xl">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <Dialog.Title className="text-fg text-sm font-semibold">
              {label}
            </Dialog.Title>
            <Dialog.Close className="text-fg-muted hover:text-fg rounded-md p-1">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <p className="text-fg-tertiary px-4 pb-2 text-xs">
            Select a destination folder or choose root.
          </p>

          <div className="border-border mx-4 min-h-[180px] max-h-[40vh] overflow-y-auto rounded-lg border p-1">
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                selected === ''
                  ? 'bg-accent/15 text-accent font-medium'
                  : 'text-fg-secondary hover:bg-bg-tertiary',
              )}
              onClick={() => setSelected('')}
            >
              <Folder className="size-4 shrink-0 text-amber-500/80" />
              <span className="italic">Root</span>
            </button>

            {tree.map((node) => (
              <FolderRow
                key={node.path}
                node={node}
                depth={1}
                selected={selected}
                onSelect={setSelected}
                onToggle={(p) => void toggleFolder(p)}
              />
            ))}
          </div>

          {showNewFolder ? (
            <div className="flex items-center gap-2 px-4 pt-2">
              <input
                autoFocus
                className="border-border bg-bg-secondary text-fg min-w-0 flex-1 rounded-md border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-accent"
                placeholder="New folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreateFolder()
                  if (e.key === 'Escape') setShowNewFolder(false)
                }}
              />
              <Button size="sm" onClick={() => void handleCreateFolder()}>Create</Button>
              <button
                type="button"
                className="text-fg-muted hover:text-fg p-1"
                onClick={() => setShowNewFolder(false)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-fg-secondary hover:text-fg mx-4 mt-2 flex items-center gap-1.5 text-xs"
              onClick={() => setShowNewFolder(true)}
            >
              <FolderPlus className="size-3.5" />
              New folder
            </button>
          )}

          <div className="flex justify-end gap-2 px-4 pt-3 pb-4">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={handleConfirm}>
              Move here
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
