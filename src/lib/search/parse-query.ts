const TAG_CHUNK = /(^|\s)#[a-zA-Z][\w\-/]*/g
const TAG_CAPTURE = /(?:^|\s)#([a-zA-Z][\w\-/]*)/g

/** Strip `#tags` from visible query and collect tag filters (lowercase, no #). */
export function parseSearchQuery(raw: string): { text: string; hashTags: string[] } {
  const s = raw.replace(/\r\n/g, '\n')
  const hashTags: string[] = []
  for (const m of s.matchAll(TAG_CAPTURE)) {
    hashTags.push(m[1]!.toLowerCase())
  }
  const text = s.replace(TAG_CHUNK, '$1').replace(/\s+/g, ' ').trim()
  return { text, hashTags: [...new Set(hashTags)] }
}
