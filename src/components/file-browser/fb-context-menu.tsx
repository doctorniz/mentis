'use client'

import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  Copy,
  ExternalLink,
  FolderInput,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { FbFileItem } from '@/types/file-browser'

export function FbContextMenu({
  children,
  item,
  onOpen,
  onRename,
  onDuplicate,
  onMove,
  onDelete,
}: {
  children: React.ReactNode
  item: FbFileItem
  onOpen: (item: FbFileItem) => void
  onRename: (item: FbFileItem) => void
  onDuplicate: (item: FbFileItem) => void
  onMove: (item: FbFileItem) => void
  onDelete: (item: FbFileItem) => void
}) {
  const row =
    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm outline-none transition-colors cursor-pointer data-[highlighted]:bg-bg-hover'

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="border-border-strong bg-bg z-50 min-w-[180px] rounded-lg border p-1 shadow-lg">
          <ContextMenu.Item className={row} onSelect={() => onOpen(item)}>
            <ExternalLink className="size-4" />
            Open
          </ContextMenu.Item>
          {!item.isDirectory && (
            <ContextMenu.Item className={row} onSelect={() => onDuplicate(item)}>
              <Copy className="size-4" />
              Duplicate
            </ContextMenu.Item>
          )}
          <ContextMenu.Item className={row} onSelect={() => onRename(item)}>
            <Pencil className="size-4" />
            Rename
          </ContextMenu.Item>
          <ContextMenu.Item className={row} onSelect={() => onMove(item)}>
            <FolderInput className="size-4" />
            Move…
          </ContextMenu.Item>
          <ContextMenu.Separator className="bg-border my-1 h-px" />
          <ContextMenu.Item
            className={`${row} text-danger data-[highlighted]:bg-danger/10`}
            onSelect={() => onDelete(item)}
          >
            <Trash2 className="size-4" />
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
