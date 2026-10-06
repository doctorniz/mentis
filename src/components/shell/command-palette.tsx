import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FileText, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { commands, fileTypes, titleForPath, HOME_VIEW } from '@/core/registries'
import type { CommandScopes, GlobalCommandContext } from '@/core/registries/commands'
import { getIndexManifest, isSearchIndexOpen } from '@/lib/search'
import { useNewFileActions } from '@/lib/notes/use-new-file-actions'
import { useEditorStore } from '@/stores/editor'
import { useUiStore } from '@/stores/ui'
import { toast } from '@/stores/toast'
import { cn } from '@/utils/cn'

const MAX_FILES = 20

interface Entry {
  key: string
  group: 'Editor' | 'Commands' | 'Files'
  title: string
  detail?: string
  icon?: LucideIcon
  shortcut?: string
  run: () => void | Promise<void>
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Contexts captured when the palette was opened, before it took focus. */
  contexts: Partial<CommandScopes>
  shell: Pick<GlobalCommandContext, 'openSettings' | 'openShortcuts' | 'closeVault'>
}

function openFile(path: string) {
  useEditorStore.getState().setPendingVaultOpenPath(path)
  useUiStore.getState().setVaultMode('tree')
  useUiStore.getState().setActiveView(HOME_VIEW)
}

/** Ctrl+K: run a command, or open a file by name. Loaded the first time it opens. */
export function CommandPalette({ open, onOpenChange, contexts, shell }: CommandPaletteProps) {
  const { vaultFs } = useVaultSession()
  const { createFile } = useNewFileActions(() => {})
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [paths, setPaths] = useState<string[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  // File names come from the index's manifest: no disk walk.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(0)
    if (!isSearchIndexOpen()) return
    let cancelled = false
    void getIndexManifest()
      .then((entries) => {
        if (!cancelled) setPaths(entries.map((e) => e.path))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  const global: GlobalCommandContext = useMemo(
    () => ({
      ...shell,
      vaultFs,
      openFile,
      createFile: async (id) => {
        const def = fileTypes.get(id)
        if (def) await createFile(def)
      },
    }),
    [shell, vaultFs, createFile],
  )

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = []
    const editor = contexts['markdown-editor']
    if (editor) {
      for (const c of commands.inScope('markdown-editor', query)) {
        list.push({
          key: c.id,
          group: 'Editor',
          title: c.title,
          detail: c.description,
          icon: c.icon,
          run: () => c.run(editor),
        })
      }
    }
    for (const c of commands.inScope('global', query)) {
      list.push({
        key: c.id,
        group: 'Commands',
        title: c.title,
        detail: c.description,
        icon: c.icon,
        shortcut: c.shortcut,
        run: () => c.run(global),
      })
    }
    const q = query.trim().toLowerCase()
    if (q) {
      const named = paths.filter((p) => p.toLowerCase().includes(q))
      // Names that match come before paths that only match in a folder.
      const nameHit = (p: string) => titleForPath(p).toLowerCase().includes(q)
      named.sort((a, b) => Number(nameHit(b)) - Number(nameHit(a)) || a.localeCompare(b))
      for (const path of named.slice(0, MAX_FILES)) {
        const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
        list.push({
          key: `file:${path}`,
          group: 'Files',
          title: titleForPath(path),
          detail: folder || undefined,
          icon: fileTypes.resolve(path)?.appearance?.icon ?? FileText,
          run: () => openFile(path),
        })
      }
    }
    return list
  }, [contexts, query, paths, global])

  useEffect(() => setSelected(0), [query])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  function runEntry(entry: Entry | undefined) {
    if (!entry) return
    onOpenChange(false)
    // Run once the dialog has closed and handed focus back (to the editor, for editor commands).
    setTimeout(() => {
      void Promise.resolve()
        .then(entry.run)
        .catch((err) => {
          console.error(`Command "${entry.title}" failed:`, err)
          toast.error(`Could not run "${entry.title}"`)
        })
    }, 0)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => (entries.length ? (i + 1) % entries.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => (entries.length ? (i + entries.length - 1) % entries.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runEntry(entries[selected])
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[199] bg-black/30" />
        <Dialog.Content
          aria-label="Command palette"
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className="border-border bg-bg fixed top-[15vh] left-1/2 z-[200] flex w-[min(100vw-2rem,560px)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border shadow-xl outline-none"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="border-border flex items-center gap-2 border-b px-3">
            <Search className="text-fg-muted size-4 shrink-0" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command or file name…"
              aria-label="Command or file name"
              className="text-fg placeholder:text-fg-muted w-full bg-transparent py-3 text-sm outline-none"
            />
          </div>
          <div
            ref={listRef}
            role="listbox"
            aria-label="Commands and files"
            className="max-h-[min(60vh,420px)] overflow-y-auto py-1"
          >
            {entries.length === 0 && (
              <p className="text-fg-muted px-3 py-6 text-center text-sm">No matches</p>
            )}
            {entries.map((entry, index) => {
              const Icon = entry.icon
              const showGroup = index === 0 || entries[index - 1]!.group !== entry.group
              return (
                <div key={entry.key}>
                  {showGroup && (
                    <p className="text-fg-tertiary px-3 pt-2 pb-1 text-[10px] font-bold tracking-widest uppercase">
                      {entry.group}
                    </p>
                  )}
                  <button
                    type="button"
                    role="option"
                    data-index={index}
                    aria-selected={index === selected}
                    onMouseMove={() => setSelected(index)}
                    onClick={() => runEntry(entry)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm',
                      index === selected && 'bg-accent-light',
                    )}
                  >
                    {Icon ? (
                      <Icon className="text-fg-muted size-4 shrink-0" aria-hidden />
                    ) : (
                      <span className="size-4 shrink-0" />
                    )}
                    <span className="text-fg min-w-0 truncate">{entry.title}</span>
                    {entry.detail && (
                      <span className="text-fg-muted min-w-0 truncate text-xs">{entry.detail}</span>
                    )}
                    {entry.shortcut && (
                      <kbd className="border-border text-fg-muted ml-auto shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                        {entry.shortcut}
                      </kbd>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
