import { ListChecks } from 'lucide-react'
import type { CaptureDestination, ParseResult } from '@/core/registries/capture'

const LAST_LIST_KEY = 'mentis:capture-last-list'

function lastList(): string {
  try {
    return localStorage.getItem(LAST_LIST_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Everything typed is the item: lists have no dates, priorities or tags to parse out. */
const parseItem = (input: string): ParseResult => ({
  values: { list: lastList(), item: input.trim(), note: '' },
  matchedSpans: [],
  residual: input.trim(),
})

/**
 * An item added to the end of a list, by name. A name no list has yet
 * creates that list (a checklist in `_mentis/_lists/`).
 */
const list: CaptureDestination = {
  id: 'list',
  sigil: '/list',
  aliases: ['/l'],
  label: 'List',
  icon: ListChecks,
  hint: 'Milk, on the weekly shop',
  immediate: false,
  residualField: 'item',
  parseNow: parseItem,
  parse: async (input) => parseItem(input),
  fields: () => [
    {
      key: 'list',
      label: 'List',
      kind: 'combobox',
      required: true,
      emptyLabel: 'Choose or name a list',
      async options({ vaultFs }) {
        const { useListsStore } = await import('@/stores/lists')
        await useListsStore.getState().loadLists(vaultFs)
        return useListsStore.getState().lists.map((l) => l.title)
      },
    },
    { key: 'item', label: 'Item', kind: 'text', required: true },
    { key: 'note', label: 'Note', kind: 'text', placeholder: 'A note or quantity' },
  ],
  async write(values, { vaultFs }) {
    const name = String(values.list ?? '').trim()
    const item = String(values.item ?? '').trim()
    if (!name || !item) return null
    const note = String(values.note ?? '').trim()
    const [{ useListsStore }, { appendToList }, { reindexFilePath }] = await Promise.all([
      import('@/stores/lists'),
      import('@/lib/lists'),
      import('@/lib/search/build-vault-index'),
    ])
    const store = useListsStore.getState()
    await store.loadLists(vaultFs)
    const existing = useListsStore
      .getState()
      .lists.find((l) => l.title.toLowerCase() === name.toLowerCase())
    const path = existing?.path ?? (await store.createList(vaultFs, name, 'checklist'))
    const raw = await vaultFs.readTextFile(path)
    await vaultFs.writeTextFile(path, appendToList(raw, item, note))
    if (!path.startsWith('_mentis/')) await reindexFilePath(vaultFs, path)
    try {
      localStorage.setItem(LAST_LIST_KEY, existing?.title ?? name)
    } catch {
      /* a convenience only */
    }
    void useListsStore.getState().loadLists(vaultFs)
    window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    return { message: `Added to ${existing?.title ?? name}` }
  },
}

export default [list]
