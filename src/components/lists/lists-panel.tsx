import { useEffect, useState } from 'react'
import { ArrowLeft, ListChecks, ListOrdered, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { ListEditor } from '@/components/lists/list-editor'
import type { ListKind } from '@/lib/lists'
import { useListsStore } from '@/stores/lists'
import { cn } from '@/utils/cn'

const RESET_LABEL: Record<string, string> = {
  daily: 'Resets daily',
  weekly: 'Resets weekly',
  monthly: 'Resets monthly',
}

/**
 * The organizer's Lists tab: every list in the vault — `_mentis/_lists/` and
 * `.list.md` files in notebooks — opened here in the list editor.
 */
export function ListsPanel() {
  const { vaultFs } = useVaultSession()
  const lists = useListsStore((s) => s.lists)
  const loading = useListsStore((s) => s.loading)
  const loadLists = useListsStore((s) => s.loadLists)
  const createList = useListsStore((s) => s.createList)
  const removeList = useListsStore((s) => s.removeList)
  const [open, setOpen] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ListKind>('checklist')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    void loadLists(vaultFs)
  }, [vaultFs, loadLists])

  async function create() {
    if (!name.trim()) return
    const path = await createList(vaultFs, name.trim(), kind)
    setName('')
    setOpen(path)
  }

  if (open) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-border flex items-center justify-between border-b px-3 py-1.5">
          <button
            type="button"
            onClick={() => {
              setOpen(null)
              setConfirmDelete(false)
              void loadLists(vaultFs)
            }}
            className="text-fg-secondary hover:text-fg flex items-center gap-1.5 rounded px-2 py-1 text-sm"
          >
            <ArrowLeft className="size-4" /> All lists
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirmDelete) {
                setConfirmDelete(true)
                return
              }
              await removeList(vaultFs, open)
              setOpen(null)
              setConfirmDelete(false)
            }}
            onBlur={() => setConfirmDelete(false)}
            className={cn(
              'flex items-center gap-1.5 rounded px-2 py-1 text-xs',
              confirmDelete ? 'bg-danger/10 text-danger' : 'text-fg-muted hover:text-danger',
            )}
          >
            <Trash2 className="size-3.5" />
            {confirmDelete ? 'Click again to delete' : 'Delete list'}
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ListEditor key={open} path={open} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="text-fg-muted size-6 animate-spin" />
          </div>
        ) : lists.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <ListChecks className="text-fg-muted/30 size-10" />
            <p className="text-fg-muted text-sm">
              No lists yet. Checklists you tick off, routines that reset, steps in order.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {lists.map((l) => {
              const Icon = l.kind === 'ordered' ? ListOrdered : ListChecks
              return (
                <button
                  key={l.path}
                  type="button"
                  onClick={() => setOpen(l.path)}
                  className="border-border bg-bg hover:border-border-strong hover:bg-bg-hover rounded-xl border p-4 text-left transition-colors"
                >
                  <p className="text-fg mb-1.5 flex items-center gap-1.5 truncate text-sm font-semibold">
                    <Icon className="text-fg-muted size-4 shrink-0" aria-hidden />
                    {l.title}
                  </p>
                  <p className="text-fg-muted text-xs">
                    {l.total === 0 ? 'Empty' : `${l.done} of ${l.total} done`}
                  </p>
                  {l.reset && (
                    <p className="text-fg-muted mt-1 flex items-center gap-1 text-[11px]">
                      <RotateCcw className="size-3" aria-hidden /> {RESET_LABEL[l.reset]}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="border-border flex items-center gap-2 border-t px-4 py-2.5">
        <Plus className="text-fg-muted/50 size-4 shrink-0" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create()}
          placeholder="New list…"
          aria-label="New list name"
          className="text-fg placeholder:text-fg-muted/40 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <select
          aria-label="Kind of new list"
          value={kind}
          onChange={(e) => setKind(e.target.value as ListKind)}
          className="border-border bg-bg-secondary text-fg rounded-md border px-2 py-1 text-xs"
        >
          <option value="checklist">Checklist</option>
          <option value="ordered">Ordered</option>
        </select>
      </div>
    </div>
  )
}
