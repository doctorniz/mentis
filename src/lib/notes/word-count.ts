/** Whitespace-delimited word count of plain text (frontmatter/markup already stripped by the caller). */
export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/** Rounds to the nearest minute, floored at 1 for any non-empty text. */
export function estimateReadingMinutes(words: number, wordsPerMinute = 200): number {
  if (words <= 0) return 0
  return Math.max(1, Math.round(words / wordsPerMinute))
}

export function formatWordCount(words: number): string {
  if (words === 0) return '0 words'
  const minutes = estimateReadingMinutes(words)
  return `${words.toLocaleString()} word${words === 1 ? '' : 's'} · ${minutes} min read`
}
