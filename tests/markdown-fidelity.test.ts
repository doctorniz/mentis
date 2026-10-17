/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { markdownToTiptapJSON, tiptapJSONToMarkdown } from '@/lib/editor/markdown-bridge'

/**
 * Opening a note and saving it without edits must not change it. Each case is
 * markdown as the editor writes it; loading and saving must give back exactly
 * the same text (not merely something stable on a second pass).
 */
const roundTrip = (md: string) => tiptapJSONToMarkdown(markdownToTiptapJSON(md))

const CORPUS: Record<string, string> = {
  'headings and paragraphs': '# Title\n\nA paragraph.\n\n## Section\n\nAnother one.',
  'emphasis, code and links': 'Some **bold**, *italic*, `code` and a [link](https://example.com).',
  'a tight bullet list': '- one\n- two\n- three',
  'a nested bullet list': '- one\n  - one a\n  - one b\n- two',
  'an ordered list': '1. first\n2. second\n3. third',
  'a list after a paragraph': 'Groceries:\n\n- milk\n- eggs',
  'a code fence with its language': '```ts\nconst x = 1\n```',
  'a code fence without a language': '```\nplain\n```',
  'a blockquote': '> Quoted text.',
  'a horizontal rule': 'Above\n\n---\n\nBelow',
  'a table': '| a | b |\n| --- | --- |\n| 1 | 2 |',
  'a table with alignment': '| Left | Centre | Right |\n| :--- | :---: | ---: |\n| a | b | c |',
  'an HTML comment': 'Before\n\n<!-- a private note -->\n\nAfter',
  'an inline HTML comment': 'Text <!-- note --> more.',
  'inline HTML': 'Press <kbd>Ctrl</kbd> and see <span class="x">this</span>.',
  'a footnote': 'A claim.[^1]\n\n[^1]: The source.',
  'a callout': '> [!note]\n> Remember this.',
  'a task list': '- [ ] todo\n- [x] done',
  'a wiki link': 'See [[Other note]] and [[Other note|that one]].',
  'a highlight': 'Some ==marked== text.',
  'inline maths': 'Euler: $e^{i\\pi} + 1 = 0$.',
  'a line break': 'First line\nsecond line',
  'a two-line quote': '> One\n> Two',
  'an underline': 'Some <u>underlined</u> text.',
  'a line break in a table cell': '| a | b |\n| --- | --- |\n| one<br>two | 2 |',
  'snake_case words': 'Call my_function_name and read file_name.md.',
  'a list item with two paragraphs': '- first\n\n  more about it\n\n- second',
  'a nested ordered list': '1. one\n   - inner\n2. two',
  'a heading after a list': '- a\n- b\n\n## Next',
  'an image': '![A cat](cat.png)',
  'a URL': 'Visit https://example.com today.',
}

describe('markdown fidelity', () => {
  for (const [name, md] of Object.entries(CORPUS)) {
    it(`keeps ${name} unchanged`, () => {
      expect(roundTrip(md)).toBe(md)
    })
  }
})
