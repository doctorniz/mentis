import type { SuggestionMatch, Trigger } from '@tiptap/suggestion'

type Seg = { docFrom: number; len: number }

function bufOffsetToDoc(segs: Seg[], posInBuf: number): number {
  let acc = 0
  for (const seg of segs) {
    if (posInBuf < acc + seg.len) {
      return seg.docFrom + (posInBuf - acc)
    }
    acc += seg.len
  }
  const last = segs[segs.length - 1]
  return last ? last.docFrom + last.len : 0
}

/** Match an open `[[…` (no closing `]]`) before the cursor for wiki autocomplete. */
export function findWikiLinkSuggestionMatch({ $position }: Trigger): SuggestionMatch | null {
  const parent = $position.parent
  if (!parent.isTextblock) return null

  const blockStart = $position.start()
  const end = $position.pos

  let pos = blockStart
  let buf = ''
  const segs: Seg[] = []

  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i)
    if (pos >= end) break

    if (child.isText) {
      const t = child.text ?? ''
      const sliceEnd = Math.min(pos + t.length, end)
      const slice = t.slice(0, sliceEnd - pos)
      if (slice.length > 0) {
        segs.push({ docFrom: pos, len: slice.length })
        buf += slice
      }
      pos += child.nodeSize
    } else if (child.type.name === 'wikiLink') {
      const t = String(child.attrs?.target ?? '')
      const l = String(child.attrs?.label ?? t)
      const synthetic = l === t || l === '' ? `[[${t}]]` : `[[${t}|${l}]]`
      segs.push({ docFrom: pos, len: synthetic.length })
      buf += synthetic
      pos += child.nodeSize
    } else {
      pos += child.nodeSize
    }
  }

  const openBuf = buf.lastIndexOf('[[')
  if (openBuf === -1 || segs.length === 0) return null

  const tail = buf.slice(openBuf + 2)
  if (tail.includes(']]')) return null

  const pipeAt = tail.indexOf('|')
  const query = (pipeAt >= 0 ? tail.slice(0, pipeAt) : tail).trim()

  const from = bufOffsetToDoc(segs, openBuf)
  const to = end
  if (from >= to) return null

  return {
    range: { from, to },
    query,
    text: buf.slice(openBuf),
  }
}
