/** Build a short excerpt highlighting query terms (case-insensitive). */
export function buildSnippet(
  text: string,
  terms: string[],
  maxLen = 140,
): { before: string; hit: string; after: string } | null {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t || terms.length === 0) {
    if (!t) return null
    const slice = t.length > maxLen ? `${t.slice(0, maxLen)}…` : t
    return { before: slice, hit: '', after: '' }
  }

  const lower = t.toLowerCase()
  let bestIdx = -1
  let bestTerm = ''

  for (const term of terms) {
    const q = term.toLowerCase()
    if (q.length < 2) continue
    const i = lower.indexOf(q)
    if (i !== -1 && (bestIdx === -1 || i < bestIdx)) {
      bestIdx = i
      bestTerm = t.slice(i, i + term.length)
    }
  }

  if (bestIdx === -1) {
    const slice = t.length > maxLen ? `${t.slice(0, maxLen)}…` : t
    return { before: slice, hit: '', after: '' }
  }

  const pad = Math.max(0, Math.floor((maxLen - bestTerm.length) / 2))
  const start = Math.max(0, bestIdx - pad)
  const end = Math.min(t.length, bestIdx + bestTerm.length + (maxLen - bestTerm.length - (bestIdx - start)))
  const before = `${start > 0 ? '…' : ''}${t.slice(start, bestIdx)}`
  const hit = t.slice(bestIdx, bestIdx + bestTerm.length)
  const after = `${t.slice(bestIdx + bestTerm.length, end)}${end < t.length ? '…' : ''}`
  return { before, hit, after }
}
