/** Fired when the index changed under the UI: a file was reindexed, or a reconcile finished. */
export const INDEX_CHANGED_EVENTS = ['ink:search-index-changed', 'ink:search-index-reconciled']

export function announceIndexChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(INDEX_CHANGED_EVENTS[0]))
}
