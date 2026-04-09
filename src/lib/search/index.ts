import MiniSearch from 'minisearch'
import type { SearchFilters, SearchIndexDocument, SearchResult } from '@/types/search'
import { parseSearchQuery } from '@/lib/search/parse-query'
import { buildSnippet } from '@/lib/search/snippet'

let searchIndex: MiniSearch<SearchIndexDocument> | null = null

function createIndex(): MiniSearch<SearchIndexDocument> {
  return new MiniSearch<SearchIndexDocument>({
    idField: 'id',
    fields: ['title', 'content', 'tags'],
    storeFields: ['path', 'title', 'fileType', 'tagCsv', 'modifiedAt', 'content'],
    searchOptions: {
      boost: { title: 3, tags: 2, content: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  })
}

export function getSearchIndex(): MiniSearch<SearchIndexDocument> {
  if (!searchIndex) {
    searchIndex = createIndex()
  }
  return searchIndex
}

export function clearSearchIndex(): void {
  searchIndex = null
}

/** Replace the entire index (e.g. vault open or full rebuild). */
export function replaceSearchIndex(documents: SearchIndexDocument[]): void {
  searchIndex = createIndex()
  if (documents.length > 0) {
    searchIndex.addAll(documents)
  }
}

export function upsertSearchDocument(doc: SearchIndexDocument): void {
  const index = getSearchIndex()
  if (index.has(doc.id)) {
    index.replace(doc)
  } else {
    index.add(doc)
  }
}

export function removeSearchDocument(id: string): void {
  const index = getSearchIndex()
  if (index.has(id)) {
    index.discard(id)
  }
}

function applyFilters(result: SearchIndexDocument, filters: SearchFilters): boolean {
  if (filters.fileType !== undefined) {
    if (filters.fileType.length === 0) return false
    if (!filters.fileType.includes(result.fileType)) return false
  }
  if (filters.folder?.trim()) {
    const prefix = filters.folder.replace(/^\/+|\/+$/g, '')
    const p = result.path.replace(/^\/+/, '')
    if (!p.startsWith(prefix) && p !== prefix) return false
  }
  if (filters.tags?.length) {
    const docTags = new Set(
      result.tagCsv
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    )
    for (const tag of filters.tags) {
      if (!docTags.has(tag.toLowerCase())) return false
    }
  }
  if (filters.dateRange?.from || filters.dateRange?.to) {
    const t = new Date(result.modifiedAt).getTime()
    if (Number.isNaN(t)) return false
    if (filters.dateRange.from) {
      const from = new Date(filters.dateRange.from)
      from.setHours(0, 0, 0, 0)
      if (t < from.getTime()) return false
    }
    if (filters.dateRange.to) {
      const to = new Date(filters.dateRange.to)
      to.setHours(23, 59, 59, 999)
      if (t > to.getTime()) return false
    }
  }
  return true
}

function matchInfoToLegacy(match: Record<string, string[]>): SearchResult['matches'] {
  const out: SearchResult['matches'] = []
  for (const [term, fields] of Object.entries(match)) {
    for (const field of fields) {
      out.push({ field, term, context: '' })
    }
  }
  return out
}

/**
 * Run search with optional `#tag` tokens in `rawQuery` (AND with `filters.tags`).
 */
export function searchVault(rawQuery: string, filters: SearchFilters = {}): SearchResult[] {
  const index = getSearchIndex()
  const { text, hashTags } = parseSearchQuery(rawQuery)
  const tagSet = new Set([
    ...(filters.tags ?? []).map((t) => t.toLowerCase()),
    ...hashTags,
  ])
  const mergedFilters: SearchFilters = {
    ...filters,
    tags: tagSet.size > 0 ? [...tagSet] : undefined,
  }

  const query: string | typeof MiniSearch.wildcard =
    text.length > 0 ? text : MiniSearch.wildcard

  const raw = index.search(query, {
    filter: (result) =>
      applyFilters(result as unknown as SearchIndexDocument, mergedFilters),
  })

  return raw.map((r) => {
    const doc = r as unknown as SearchIndexDocument
    const sn = buildSnippet(doc.content, r.queryTerms)
    return {
      id: String(r.id),
      path: doc.path,
      title: doc.title,
      type: doc.fileType,
      score: r.score,
      matches: matchInfoToLegacy(r.match),
      snippetBefore: sn?.before ?? '',
      snippetHit: sn?.hit ?? '',
      snippetAfter: sn?.after ?? '',
    }
  })
}

/** @deprecated use clearSearchIndex */
export function clearIndex(): void {
  clearSearchIndex()
}
