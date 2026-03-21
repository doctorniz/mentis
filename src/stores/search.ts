import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { SearchResult, SearchFilters } from '@/types/search'

interface SearchState {
  query: string
  results: SearchResult[]
  filters: SearchFilters
  isSearching: boolean
  totalResults: number

  setQuery: (query: string) => void
  setResults: (results: SearchResult[]) => void
  setFilters: (filters: SearchFilters) => void
  setIsSearching: (isSearching: boolean) => void
  clearSearch: () => void
}

export const useSearchStore = create<SearchState>()(
  immer((set) => ({
    query: '',
    results: [],
    filters: {},
    isSearching: false,
    totalResults: 0,

    setQuery: (query) =>
      set((state) => {
        state.query = query
      }),

    setResults: (results) =>
      set((state) => {
        state.results = results
        state.totalResults = results.length
        state.isSearching = false
      }),

    setFilters: (filters) =>
      set((state) => {
        state.filters = filters
      }),

    setIsSearching: (isSearching) =>
      set((state) => {
        state.isSearching = isSearching
      }),

    clearSearch: () =>
      set((state) => {
        state.query = ''
        state.results = []
        state.filters = {}
        state.isSearching = false
        state.totalResults = 0
      }),
  })),
)
