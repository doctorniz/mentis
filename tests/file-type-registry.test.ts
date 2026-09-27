import { describe, expect, it } from 'vitest'
import { createFileTypeRegistry, type FileTypeDefinition } from '@/core/registries/file-types'

const md: FileTypeDefinition = { id: 'markdown', label: 'Note', suffixes: ['.md', '.markdown'] }
const slides: FileTypeDefinition = { id: 'slides', label: 'Slides', suffixes: ['.slides.md'] }
const pdf: FileTypeDefinition = { id: 'pdf', label: 'PDF', suffixes: ['.pdf'] }
const code: FileTypeDefinition = { id: 'code', label: 'Code', suffixes: ['.env', '.txt'] }
const kanban: FileTypeDefinition = {
  id: 'kanban',
  label: 'Kanban',
  suffixes: ['.kanban'],
  claims: { baseType: 'markdown', test: (t) => /^---[\s\S]*?type:\s*kanban/.test(t) },
}

const registry = createFileTypeRegistry([md, slides, pdf, code, kanban])
const id = (p: string) => registry.resolve(p)?.id

describe('resolveFileType', () => {
  it('matches compound suffixes before their last segment', () => {
    expect(id('deck.slides.md')).toBe('slides')
    expect(id('notes/deck.slides.md')).toBe('slides')
    expect(id('plain.md')).toBe('markdown')
  })

  it('is case-insensitive', () => {
    expect(id('Report.PDF')).toBe('pdf')
    expect(id('Deck.Slides.MD')).toBe('slides')
  })

  it('does not match on a directory segment', () => {
    expect(id('folder.pdf/readme.txt')).toBe('code')
  })

  it('treats a trailing unknown extension as unknown', () => {
    expect(id('a.md.bak')).toBeUndefined()
    expect(id('archive.tar.gz')).toBeUndefined()
  })

  it('resolves dotfiles by their name', () => {
    expect(id('.env')).toBe('code')
  })

  it('keeps the old lookup for dot-less names equal to an extension', () => {
    expect(id('md')).toBe('markdown')
    expect(id('Makefile')).toBeUndefined()
  })

  it('rejects duplicate ids and contested suffixes', () => {
    expect(() => createFileTypeRegistry([md, md])).toThrow(/registered twice/)
    expect(() =>
      createFileTypeRegistry([md, { id: 'other', label: 'x', suffixes: ['.MD'] }]),
    ).toThrow(/claimed by both/)
    expect(() => createFileTypeRegistry([{ id: 'x', label: 'x', suffixes: ['md'] }])).toThrow(
      /must start with/,
    )
  })
})

describe('detect', () => {
  const read = (text: string) => async () => text

  it('lets a claim take over the base type by content', async () => {
    const board = '---\ntype: kanban\n---\n## Todo\n'
    expect((await registry.detect('b.md', read(board)))?.id).toBe('kanban')
    expect((await registry.detect('n.md', read('# Hello')))?.id).toBe('markdown')
  })

  it('never reads files whose type has no claimants', async () => {
    let reads = 0
    const counting = async () => {
      reads++
      return ''
    }
    expect((await registry.detect('x.pdf', counting))?.id).toBe('pdf')
    expect((await registry.detect('deck.slides.md', counting))?.id).toBe('slides')
    expect(reads).toBe(0)
  })

  it('falls back to the suffix type when the read fails', async () => {
    const failing = async () => {
      throw new Error('gone')
    }
    expect((await registry.detect('b.md', failing))?.id).toBe('markdown')
  })
})
