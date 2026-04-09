import { describe, it, expect } from 'vitest'
import { buildPageTextMap, findAllMatchStartIndices } from '@/lib/pdf/search-pdf-text'

describe('buildPageTextMap', () => {
  it('flattens text items and maps chars to item indices', () => {
    const { text, charToItem } = buildPageTextMap([
      { str: 'ab', dir: 'ltr', transform: [], width: 1, height: 1, fontName: 'f', hasEOL: false },
      { str: 'cd', dir: 'ltr', transform: [], width: 1, height: 1, fontName: 'f', hasEOL: true },
    ] as never[])
    expect(text).toBe('abcd\n')
    expect(charToItem).toEqual([0, 0, 1, 1, -1])
  })
})

describe('findAllMatchStartIndices', () => {
  it('finds overlapping matches case-insensitively', () => {
    expect(findAllMatchStartIndices('aAaA', 'aa', false)).toEqual([0, 2])
  })

  it('returns empty for empty needle', () => {
    expect(findAllMatchStartIndices('hello', '', false)).toEqual([])
  })
})
