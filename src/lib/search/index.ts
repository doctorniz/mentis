import MiniSearch from 'minisearch'
import type { SearchIndexEntry, SearchResult, SearchFilters } from '@/types/search'

const SEARCH_FIELDS = ['title', 'content', 'tags'] as const
const STORED_FIELDS = ['path', 'title', 'type', 'tags', 'modifiedAt'] as const

let searchIndex: MiniSearch<SearchIndexEntry> | null = null

export function getSearchIndex(): MiniSearch<SearchIndexEntry> {
  if (!searchIndex) {
    searchIndex = new MiniSearch<SearchIndexEntry>({
      fields: [...SEARCH_FIELDS],
      storeFields: [...STORED_FIELDS],
      searchOptions: {
        boost: { title: 3, tags: 2, content: 1 },
        fuzzy: 0.2,
        prefix: true,
      },
    })
  }
  return searchIndex
}

export function addToIndex(entry: SearchIndexEntry): void {
  const index = getSearchIndex()
  if (index.has(entry.id)) {
    index.replace(entry)
  } else {
    index.add(entry)
  }
}

export function removeFromIndex(id: string): void {
  const index = getSearchIndex()
  if (index.has(id)) {
    index.discard(id)
  }
}

export function search(query: string, filters?: SearchFilters): SearchResult[] {
  const index = getSearchIndex()
  if (!query.trim()) return []

  const results = index.search(query)

  return results
    .filter((result) => {
      const doc = result as unknown as SearchIndexEntry
      if (filters?.fileType?.length && !filters.fileType.includes(doc.type as never)) {
        return false
      }
      if (filters?.folder && !doc.path.startsWith(filters.folder)) {
        return false
      }
      return true
    })
    .map((result) => ({
      id: result.id as string,
      path: (result as unknown as SearchIndexEntry).path,
      title: (result as unknown as SearchIndexEntry).title,
      type: (result as unknown as SearchIndexEntry).type as SearchResult['type'],
      score: result.score,
      matches: Object.entries(result.match).map(([term, fields]) => ({
        field: fields[0],
        term,
        context: '',
      })),
    }))
}

export function clearIndex(): void {
  searchIndex = null
}
