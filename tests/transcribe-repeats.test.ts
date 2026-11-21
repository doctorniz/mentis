import { describe, expect, it } from 'vitest'
import { collapseRepeats } from '@/lib/audio/transcribe'

describe('collapseRepeats', () => {
  it('keeps a word that loops once', () => {
    expect(collapseRepeats('test message message message message message')).toBe('test message')
  })
  it('keeps a phrase that loops once', () => {
    expect(collapseRepeats('hello there the end the end the end the end')).toBe(
      'hello there the end',
    )
  })
  it('leaves ordinary speech alone, even with doubled words', () => {
    expect(collapseRepeats('that that is fine')).toBe('that that is fine')
    expect(collapseRepeats('no no no wait')).toBe('no no no wait')
  })
})
