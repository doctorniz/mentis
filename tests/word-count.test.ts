import { describe, it, expect } from 'vitest'
import { countWords, estimateReadingMinutes, formatWordCount } from '@/lib/notes/word-count'

describe('countWords', () => {
  it('counts whitespace-delimited words', () => {
    expect(countWords('one two three')).toBe(3)
  })

  it('collapses multiple spaces and newlines', () => {
    expect(countWords('one   two\n\nthree')).toBe(3)
  })

  it('returns 0 for empty or whitespace-only text', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n  ')).toBe(0)
  })

  it('counts a single word', () => {
    expect(countWords('hello')).toBe(1)
  })
})

describe('estimateReadingMinutes', () => {
  it('returns 0 for no words', () => {
    expect(estimateReadingMinutes(0)).toBe(0)
  })

  it('floors at 1 minute for any non-empty text', () => {
    expect(estimateReadingMinutes(5)).toBe(1)
  })

  it('rounds to the nearest minute at 200wpm', () => {
    expect(estimateReadingMinutes(400)).toBe(2)
    expect(estimateReadingMinutes(500)).toBe(3)
  })
})

describe('formatWordCount', () => {
  it('formats zero words without a reading time', () => {
    expect(formatWordCount(0)).toBe('0 words')
  })

  it('pluralizes a single word', () => {
    expect(formatWordCount(1)).toBe('1 word · 1 min read')
  })

  it('formats a larger count with thousands separators', () => {
    expect(formatWordCount(1234)).toBe('1,234 words · 6 min read')
  })
})
