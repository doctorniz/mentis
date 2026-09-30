/**
 * Splits a document's text into overlapping passages for chat retrieval.
 * Passages break at paragraph ends where they can, then sentence ends, then
 * whitespace. Each passage after the first starts with the tail of the one
 * before, so a fact spanning a boundary is whole in at least one of them.
 */

export const CHUNK_CHARS = 1_500
export const CHUNK_OVERLAP = 200

function splitLong(piece: string, max: number): string[] {
  if (piece.length <= max) return [piece]
  const sentences = piece.split(/(?<=[.!?])\s+/)
  if (sentences.length > 1) return sentences.flatMap((s) => splitLong(s, max))
  const out: string[] = []
  let rest = piece
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max)
    if (cut < max / 2) cut = max
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

/** The last `n` or so characters of `text`, starting at a word. */
function tail(text: string, n: number): string {
  if (text.length <= n) return text
  const from = text.length - n
  const space = text.indexOf(' ', from)
  return space === -1 ? text.slice(from) : text.slice(space + 1)
}

export function chunkText(text: string, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
  const pieces = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => splitLong(p, size - overlap))

  const chunks: string[] = []
  let current = ''
  let fresh = false
  for (const piece of pieces) {
    if (fresh && current.length + piece.length + 2 > size) {
      chunks.push(current)
      current = tail(current, overlap)
      fresh = false
    }
    current = current ? `${current}\n\n${piece}` : piece
    fresh = true
  }
  if (current && fresh) chunks.push(current)
  return chunks
}

/**
 * Join passages that follow one another in a document, dropping the text a
 * passage repeats from the one before it.
 */
export function joinAdjacent(prev: string, next: string, overlap = CHUNK_OVERLAP): string {
  for (let k = Math.min(next.length, prev.length, overlap * 2); k >= 8; k--) {
    if (prev.endsWith(next.slice(0, k))) return prev + next.slice(k)
  }
  return `${prev}\n\n${next}`
}
