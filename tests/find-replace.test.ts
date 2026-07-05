import { describe, it, expect } from 'vitest'
import { getSchema } from '@tiptap/core'
import { Node as PmNode } from '@tiptap/pm/model'
import { getNoteEditorExtensions } from '@/lib/editor/tiptap-extensions'
import { markdownToTiptapJSON } from '@/lib/editor/markdown-bridge'
import { findMatches } from '@/lib/editor/find-replace'

const schema = getSchema(getNoteEditorExtensions())

function docFromMarkdown(md: string): PmNode {
  return PmNode.fromJSON(schema, markdownToTiptapJSON(md))
}

function matchTexts(doc: PmNode, term: string): string[] {
  return findMatches(doc, term).map((m) => doc.textBetween(m.from, m.to))
}

describe('findMatches', () => {
  it('finds all occurrences in plain text', () => {
    const doc = docFromMarkdown('the cat sat on the mat with the hat')
    expect(matchTexts(doc, 'the')).toEqual(['the', 'the', 'the'])
  })

  it('is case-insensitive but reports original casing', () => {
    const doc = docFromMarkdown('Hello world, hello again, HELLO!')
    expect(matchTexts(doc, 'hello')).toEqual(['Hello', 'hello', 'HELLO'])
  })

  it('matches across mark boundaries within a block', () => {
    const doc = docFromMarkdown('he**ll**o world')
    expect(matchTexts(doc, 'hello')).toEqual(['hello'])
  })

  it('does not match across block boundaries', () => {
    const doc = docFromMarkdown('first line ends in ca\n\nt starts the next')
    expect(findMatches(doc, 'cat')).toEqual([])
  })

  it('treats regex special characters literally', () => {
    const doc = docFromMarkdown('price is $5.00 (about) [sic]')
    expect(matchTexts(doc, '(about)')).toEqual(['(about)'])
    expect(matchTexts(doc, '[sic]')).toEqual(['[sic]'])
  })

  it('returns nothing for an empty term', () => {
    const doc = docFromMarkdown('anything at all')
    expect(findMatches(doc, '')).toEqual([])
  })

  it('finds matches inside list items and headings', () => {
    const doc = docFromMarkdown('# Needle heading\n\n- has a needle\n- no match here')
    expect(matchTexts(doc, 'needle')).toEqual(['Needle', 'needle'])
  })

  it('finds non-overlapping consecutive matches', () => {
    const doc = docFromMarkdown('aaaa')
    expect(matchTexts(doc, 'aa')).toEqual(['aa', 'aa'])
  })
})
