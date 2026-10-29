/** `type: list` (quoted or not, any case) on a line of its own. */
const TYPE_LIST_RE = /^type:\s*(['"]?)list\1\s*(#.*)?$/i

/**
 * True when a note's frontmatter says `type: list`. Reads only the
 * frontmatter lines, with no YAML parser, so it is cheap enough to run on
 * every note the index reads and every markdown file opened.
 */
export function isListNote(text: string): boolean {
  if (!/^---\r?\n/.test(text)) return false
  const lines = text.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (line === '---' || line === '...') return false
    if (TYPE_LIST_RE.test(line)) return true
  }
  return false
}
