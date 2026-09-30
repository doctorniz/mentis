/** Longest body text stored per document in the search table (`fts`). */
export const SEARCH_CONTENT_CAP = 14_000

/**
 * Longest text an extractor returns. Chat retrieval chunks all of it; the cap
 * only guards memory against pathological files (about a 1,000-page book).
 */
export const FULL_TEXT_CAP = 2_000_000
