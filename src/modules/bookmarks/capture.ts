import { Bookmark } from 'lucide-react'
import type { CaptureDestination, ParseResult } from '@/core/registries/capture'
import { CaptureText, extractTags } from '@/core/capture/parse'
import { BOOKMARKS_DIR } from '@/lib/bookmarks'
import { fallbackOgMetadata, fetchOgMetadata, type OgMetadata } from '@/lib/bookmarks/og-fetch'

const URL_RE = /\s((?:https?:\/\/|www\.)\S+)/i

const normalise = (url: string) => (/^www\./i.test(url) ? `https://${url}` : url)

function parseBookmark(input: string): ParseResult {
  const text = new CaptureText(input)
  const m = text.matchAll(URL_RE)[0]
  let url = ''
  if (m) {
    // The match starts at the space before the link; the link itself is m[1].
    text.claim(m.index, m.index + m[1]!.length, 'url')
    url = normalise(m[1]!)
  }
  const tags = extractTags(text)
  return {
    values: {
      url,
      title: url ? fallbackOgMetadata(url).title : '',
      notes: text.residual(),
      tags,
      collection: '',
    },
    matchedSpans: text.spans,
    residual: text.residual(),
  }
}

function isUrl(value: unknown): boolean {
  try {
    const u = new URL(String(value))
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * A bookmark in `_mentis/_bookmarks/[<collection>/]`. The title shows the
 * hostname at once and is replaced by the page title if that arrives — the
 * same lookup as adding a bookmark in Bookmarks. Saving never waits for it.
 */
const bookmark: CaptureDestination = {
  id: 'bookmark',
  sigil: '/bookmark',
  aliases: ['/link', '/bm'],
  label: 'Bookmark',
  icon: Bookmark,
  hint: 'https://example.com #reading',
  immediate: false,
  residualField: 'notes',
  parseNow: parseBookmark,
  parse: async (input) => parseBookmark(input),
  fields: () => [
    { key: 'url', label: 'URL', kind: 'url', required: true, placeholder: 'https://' },
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'notes', label: 'Notes', kind: 'textarea' },
    { key: 'tags', label: 'Tags', kind: 'tags' },
    {
      key: 'collection',
      label: 'Collection',
      kind: 'combobox',
      emptyLabel: 'Unsorted',
      async options({ vaultFs }) {
        try {
          return (await vaultFs.readdir(BOOKMARKS_DIR))
            .filter((e) => e.isDirectory && !e.name.startsWith('.'))
            .map((e) => e.name)
        } catch {
          return []
        }
      },
    },
  ],
  validate: (v) => (isUrl(v.url) ? null : 'Enter a full link, starting with http:// or https://'),
  async enrich(v) {
    if (!isUrl(v.url)) return {}
    const og = await fetchOgMetadata(String(v.url))
    return { title: og.title, og }
  },
  async write(v, { vaultFs }) {
    const url = String(v.url ?? '').trim()
    if (!url) return null
    const fallback = fallbackOgMetadata(url)
    const og = v.og as OgMetadata | undefined
    const title = String(v.title ?? '').trim() || fallback.title
    const notes = String(v.notes ?? '').trim()
    const collection = String(v.collection ?? '').trim() || null
    const { useBookmarksStore } = await import('@/stores/bookmarks')
    const store = useBookmarksStore.getState()
    const item = await store.addBookmark(
      vaultFs,
      url,
      {
        title,
        description: notes || og?.description || '',
        tags: Array.isArray(v.tags) ? (v.tags as string[]) : [],
        ...(og ? { ogImage: og.ogImage, favicon: og.favicon } : {}),
      },
      collection,
      false,
    )
    window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    if (!og) {
      // Saved without the page's details; fill them in when they arrive.
      void fetchOgMetadata(url)
        .then((fetched) =>
          useBookmarksStore.getState().updateBookmark(vaultFs, item.path, {
            ogImage: fetched.ogImage,
            ...(title === fallback.title ? { title: fetched.title } : {}),
            ...(!notes && fetched.description ? { description: fetched.description } : {}),
          }),
        )
        .catch(() => {})
    }
    return { message: `Saved to Bookmarks${collection ? ` · ${collection}` : ''}` }
  },
}

export default [bookmark]
