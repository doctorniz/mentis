import { describe, expect, it, vi } from 'vitest'
import { chunkText, joinAdjacent, CHUNK_CHARS } from '@/core/index/chunk'
import type { PassageHit } from '@/core/index/protocol'
import type { ExtractRequest } from '@/core/index/extract'
import type { FileSystemAdapter } from '@/lib/fs'
import type { ChatSettings } from '@/types/chat'

vi.mock('@/lib/search', () => ({ searchPassages: vi.fn(async () => []) }))

const { groupPassages } = await import('@/lib/chat/vault-rag')
const { buildDocumentContext, buildSystemMessage } = await import('@/lib/chat/context-builder')

function paragraphs(n: number) {
  return Array.from({ length: n }, (_, i) => `Paragraph number ${i} says something ordinary.`)
}

describe('chunkText', () => {
  it('keeps short text as one passage', () => {
    expect(chunkText('One.\n\nTwo.')).toEqual(['One.\n\nTwo.'])
  })

  it('returns nothing for empty text', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('  \n\n ')).toEqual([])
  })

  it('covers all the text in passages no longer than the chunk size', () => {
    const paras = paragraphs(300)
    const chunks = chunkText(paras.join('\n\n'))
    expect(chunks.length).toBeGreaterThan(5)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_CHARS + 2)
    const all = chunks.join('\n')
    for (const p of paras) expect(all).toContain(p)
  })

  it('overlaps each passage with the end of the one before', () => {
    const chunks = chunkText(paragraphs(100).join('\n\n'))
    for (let i = 1; i < chunks.length; i++) {
      const head = chunks[i].slice(0, 40)
      expect(chunks[i - 1]).toContain(head)
    }
  })

  it('splits a paragraph with no breaks at sentence ends or spaces', () => {
    const wall = 'word '.repeat(2_000).trim()
    const chunks = chunkText(wall)
    expect(chunks.length).toBeGreaterThan(5)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_CHARS + 2)
  })

  it('joins adjacent passages back into the original text', () => {
    const text = paragraphs(120).join('\n\n')
    const chunks = chunkText(text)
    expect(chunks.reduce((acc, c) => joinAdjacent(acc, c))).toBe(text)
  })
})

function hit(path: string, seq: number, text: string, score: number): PassageHit {
  return { path, title: path, type: 'markdown', seq, text, score, queryTerms: ['term'] }
}

describe('groupPassages', () => {
  it('groups by file in rank order and keeps at most topK files', () => {
    const grouped = groupPassages(
      [
        hit('b.md', 3, 'b3', 9),
        hit('a.md', 0, 'a0', 8),
        hit('b.md', 1, 'b1', 7),
        hit('c.md', 0, 'c0', 6),
      ],
      2,
    )
    expect(grouped.map((g) => g.path)).toEqual(['b.md', 'a.md'])
    expect(grouped[0].score).toBe(9)
  })

  it('orders the passages of a file by position and marks gaps', () => {
    const [g] = groupPassages([hit('a.md', 5, 'later', 2), hit('a.md', 1, 'earlier', 1)], 3)
    expect(g.content).toBe('earlier\n\n…\n\nlater')
  })

  it('joins consecutive passages without repeating their overlap', () => {
    const text = paragraphs(60).join('\n\n')
    const [first, second] = chunkText(text)
    const [g] = groupPassages([hit('a.md', 1, second, 2), hit('a.md', 0, first, 1)], 3)
    expect(g.content).toBe(joinAdjacent(first, second))
    expect(text.startsWith(g.content)).toBe(true)
  })
})

describe('buildDocumentContext', () => {
  const settings = { maxContextChars: 40_000 } as ChatSettings

  function fakeFs(size = 10, mtime = 1): FileSystemAdapter {
    return {
      stat: vi.fn(async () => ({ size, modifiedAt: new Date(mtime) })),
      readTextFile: vi.fn(async () => 'text body'),
      readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
    } as unknown as FileSystemAdapter
  }

  it('gives chat the text of any type with an extractor, from the extractor', async () => {
    const seen: ExtractRequest[] = []
    const run = vi.fn(async (req: ExtractRequest) => {
      seen.push(req)
      return { title: 'Plan', content: 'Budget is 12,000 for Q3.' }
    })
    const ctx = await buildDocumentContext(fakeFs(), 'work/plan.docx', settings, 'budget', run)
    expect(seen[0]).toMatchObject({ typeId: 'docx', path: 'work/plan.docx' })
    expect(seen[0].data).toBeInstanceOf(Uint8Array)
    expect(ctx).toMatchObject({ kind: 'other', title: 'Plan', content: 'Budget is 12,000 for Q3.' })
    expect(buildSystemMessage(ctx, settings)).toContain('titled "Plan" (Word document)')
  })

  it('reads text types as text and keeps markdown and pdf kinds', async () => {
    const run = vi.fn(async () => ({ content: 'body' }))
    const note = await buildDocumentContext(fakeFs(1, 1), 'n.md', settings, undefined, run)
    expect(note.kind).toBe('markdown')
    expect(note.title).toBe('n')
    const pdf = await buildDocumentContext(fakeFs(2, 2), 'p.pdf', settings, undefined, run)
    expect(pdf.kind).toBe('pdf')
  })

  it('extracts an unchanged file once across messages', async () => {
    const run = vi.fn(async () => ({ content: 'deck text' }))
    const fs = fakeFs(77, 77)
    await buildDocumentContext(fs, 'talk.slides.md', settings, 'q1', run)
    await buildDocumentContext(fs, 'talk.slides.md', settings, 'q2', run)
    expect(run).toHaveBeenCalledTimes(1)
    await buildDocumentContext(fakeFs(78, 78), 'talk.slides.md', settings, 'q3', run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('picks the relevant slice of a document longer than the context', async () => {
    const long = `${paragraphs(2_000).join('\n\n')}\n\nThe secret word is marmalade.`
    const run = vi.fn(async () => ({ content: long }))
    const ctx = await buildDocumentContext(fakeFs(5, 5), 'big.md', settings, 'marmalade', run)
    expect(ctx.truncated).toBe(true)
    expect(ctx.content).toContain('The secret word is marmalade.')
  })

  it('gives types without an extractor their title only', async () => {
    const run = vi.fn()
    const ctx = await buildDocumentContext(fakeFs(), 'sketch.canvas', settings, undefined, run)
    expect(run).not.toHaveBeenCalled()
    expect(ctx.content).toBe('')
  })
})
