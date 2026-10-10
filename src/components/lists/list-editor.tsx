import { useCallback, useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import {
  Copy,
  Download,
  GripVertical,
  Loader2,
  RotateCcw,
  Share2,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import {
  listAsText,
  listTitle,
  newItem,
  serializeList,
  uncheckAll,
  type ListDoc,
  type ListItem,
  type ListKind,
  type ListReset,
} from '@/lib/lists'
import { reindexFilePath } from '@/lib/search/build-vault-index'
import { readListFile } from '@/stores/lists'
import { useEditorStore } from '@/stores/editor'
import { toast } from '@/stores/toast'
import { cn } from '@/utils/cn'

const SAVE_DEBOUNCE = 300

export interface ListEditorProps {
  path: string
  /** When open as a tab: its dirty state is kept. */
  tabId?: string
  /** After each save (refresh counts, search, backlinks). */
  onPersisted?: () => void
}

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * A list: check items off, reorder them (drag, or Alt+↑/↓), give them notes,
 * uncheck everything, reset on a schedule, and share a copy. Saves shortly
 * after each change and on leaving.
 */
export function ListEditor({ path, tabId, onPersisted }: ListEditorProps) {
  const { vaultFs } = useVaultSession()
  const updateTab = useEditorStore((s) => s.updateTab)
  const [doc, setDoc] = useState<ListDoc | null>(null)
  const [newText, setNewText] = useState('')
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const docRef = useRef<ListDoc | null>(null)
  docRef.current = doc
  const pathRef = useRef(path)
  pathRef.current = path
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const title = listTitle(path)

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    void readListFile(vaultFs, path)
      .then((d) => !cancelled && setDoc(d))
      .catch((err) => {
        console.error('Failed to load list', err)
        toast.error('Could not open the list')
      })
    return () => {
      cancelled = true
    }
  }, [vaultFs, path])

  const save = useCallback(async () => {
    saveTimer.current = null
    const d = docRef.current
    if (!d) return
    try {
      await vaultFs.writeTextFile(pathRef.current, serializeList(d))
      if (!pathRef.current.startsWith('_mentis/')) await reindexFilePath(vaultFs, pathRef.current)
      if (tabId) updateTab(tabId, { isDirty: false })
      onPersisted?.()
    } catch (err) {
      console.error('Failed to save list', err)
      toast.error('Could not save the list')
    }
  }, [vaultFs, tabId, updateTab, onPersisted])

  // Flush a pending save when leaving.
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        void save()
      }
    },
    [save],
  )

  const mutate = useCallback(
    (fn: (d: ListDoc) => ListDoc) => {
      setDoc((d) => (d ? fn(d) : d))
      if (tabId) updateTab(tabId, { isDirty: true })
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void save(), SAVE_DEBOUNCE)
    },
    [tabId, updateTab, save],
  )

  const updateItem = (id: string, patch: Partial<ListItem>) =>
    mutate((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-fg-muted size-6 animate-spin" />
      </div>
    )
  }

  const nextIndex = doc.kind === 'ordered' ? doc.items.findIndex((i) => !i.done) : -1
  const doneCount = doc.items.filter((i) => i.done).length

  function addItem() {
    const text = newText.trim()
    if (!text) return
    mutate((d) => ({ ...d, items: [...d.items, newItem(text)] }))
    setNewText('')
  }

  async function copyAsText() {
    try {
      await navigator.clipboard.writeText(listAsText(title, doc!))
      toast.success('List copied as text')
    } catch {
      toast.error('Could not copy the list')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <h1 className="text-fg min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
        <select
          aria-label="Kind of list"
          value={doc.kind}
          onChange={(e) => mutate((d) => ({ ...d, kind: e.target.value as ListKind }))}
          className="border-border bg-bg-secondary text-fg rounded-md border px-2 py-1 text-xs"
        >
          <option value="checklist">Checklist</option>
          <option value="ordered">Ordered</option>
        </select>
        {doc.kind === 'checklist' && (
          <select
            aria-label="Reset"
            value={doc.reset ?? ''}
            onChange={(e) => {
              const reset = (e.target.value || undefined) as ListReset | undefined
              // Count from now: changing the schedule never unchecks anything by itself.
              mutate((d) => ({ ...d, reset, lastReset: reset ? undefined : d.lastReset }))
            }}
            className="border-border bg-bg-secondary text-fg rounded-md border px-2 py-1 text-xs"
          >
            <option value="">Never resets</option>
            <option value="daily">Resets daily</option>
            <option value="weekly">Resets weekly (Mon)</option>
            <option value="monthly">Resets monthly</option>
          </select>
        )}
        <button
          type="button"
          disabled={doneCount === 0}
          onClick={() => mutate(uncheckAll)}
          className="text-fg-secondary hover:text-fg flex items-center gap-1 rounded-md px-2 py-1 text-xs disabled:opacity-40"
        >
          <RotateCcw className="size-3.5" />
          Uncheck all
        </button>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="text-fg-secondary hover:text-fg flex items-center gap-1 rounded-md px-2 py-1 text-xs"
            >
              <Share2 className="size-3.5" />
              Share
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={4}
              className="border-border bg-bg z-50 w-52 rounded-lg border p-1 shadow-lg"
            >
              <button
                type="button"
                onClick={() => void copyAsText()}
                className="hover:bg-bg-hover flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
              >
                <Copy className="size-4" /> Copy as text
              </button>
              <button
                type="button"
                onClick={() => downloadText(`${title}.list.md`, serializeList(doc))}
                className="hover:bg-bg-hover flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
              >
                <Download className="size-4" /> Save a copy
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4">
        {doc.items.length === 0 && (
          <p className="text-fg-muted px-2 py-6 text-center text-sm">No items yet.</p>
        )}
        <ol aria-label={`${title} items`} className="space-y-0.5">
          {doc.items.map((item, index) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDragFrom(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom !== null && dragFrom !== index)
                  mutate((d) => ({ ...d, items: move(d.items, dragFrom, index) }))
                setDragFrom(null)
              }}
              onDragEnd={() => setDragFrom(null)}
              onKeyDown={(e) => {
                if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
                const to = index + (e.key === 'ArrowUp' ? -1 : 1)
                if (to < 0 || to >= doc.items.length) return
                e.preventDefault()
                mutate((d) => ({ ...d, items: move(d.items, index, to) }))
              }}
              className={cn(
                'group rounded-md px-1.5 py-1',
                index === nextIndex && 'bg-accent/5 ring-accent/30 ring-1',
                dragFrom === index && 'opacity-50',
              )}
              data-next={index === nextIndex || undefined}
            >
              <div className="flex items-center gap-2">
                <GripVertical
                  className="text-fg-muted/40 size-4 shrink-0 cursor-grab"
                  aria-hidden
                />
                {doc.kind === 'ordered' && (
                  <span className="text-fg-muted w-5 shrink-0 text-right text-xs tabular-nums">
                    {index + 1}.
                  </span>
                )}
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) => updateItem(item.id, { done: e.target.checked })}
                  aria-label={`Done: ${item.text}`}
                  className="accent-accent size-4 shrink-0"
                />
                <input
                  value={item.text}
                  onChange={(e) => updateItem(item.id, { text: e.target.value })}
                  aria-label="Item"
                  className={cn(
                    'text-fg min-w-0 flex-1 bg-transparent text-sm outline-none',
                    item.done && 'text-fg-muted line-through',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setOpenNote((n) => (n === item.id ? null : item.id))}
                  aria-label={item.note ? `Note: ${item.note}` : 'Add a note'}
                  className={cn(
                    'shrink-0 rounded p-0.5',
                    item.note
                      ? 'text-accent'
                      : 'text-fg-muted/50 opacity-0 group-hover:opacity-100 focus:opacity-100',
                  )}
                >
                  <StickyNote className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    mutate((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }))
                  }
                  aria-label={`Delete ${item.text}`}
                  className="text-fg-muted/50 hover:text-danger shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {item.note && openNote !== item.id && (
                <p className="text-fg-muted ml-12 text-xs whitespace-pre-line">{item.note}</p>
              )}
              {openNote === item.id && (
                <textarea
                  autoFocus
                  rows={2}
                  value={item.note}
                  placeholder="A note or quantity"
                  aria-label={`Note for ${item.text}`}
                  onChange={(e) => updateItem(item.id, { note: e.target.value })}
                  onBlur={() => setOpenNote(null)}
                  className="border-border bg-bg-secondary text-fg mt-1 ml-12 w-[calc(100%-3rem)] resize-y rounded-md border px-2 py-1 text-xs outline-none"
                />
              )}
            </li>
          ))}
        </ol>
        <div className="mt-1 flex items-center gap-2 px-1.5 py-1">
          <span className="w-4 shrink-0" />
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addItem()
              }
            }}
            placeholder="Add an item…"
            aria-label="Add an item"
            className="text-fg placeholder:text-fg-muted/50 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>
    </div>
  )
}
