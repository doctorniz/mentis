import { describe, expect, it } from 'vitest'

import { nextGemmaStreamDelta } from '@/lib/chat/providers/gemma-stream-delta'

describe('nextGemmaStreamDelta', () => {
  it('treats repeated full-prefix updates as cumulative', () => {
    let emitted = ''
    const steps = ['Hello', 'Hello ', 'Hello world']
    let out = ''
    for (const partial of steps) {
      const r = nextGemmaStreamDelta(emitted, partial)
      emitted = r.emittedTotal
      out += r.delta
    }
    expect(out).toBe('Hello world')
    expect(emitted).toBe('Hello world')
  })

  it('treats disjoint chunks as incremental (MediaPipe sample style)', () => {
    let emitted = ''
    const chunks = ['Hello', ' world', '!']
    let out = ''
    for (const partial of chunks) {
      const r = nextGemmaStreamDelta(emitted, partial)
      emitted = r.emittedTotal
      out += r.delta
    }
    expect(out).toBe('Hello world!')
    expect(emitted).toBe('Hello world!')
  })

  it('does not mutate state on empty partial', () => {
    const r = nextGemmaStreamDelta('Hi', '')
    expect(r.delta).toBe('')
    expect(r.emittedTotal).toBe('Hi')
  })

  it('handles first chunk via cumulative rule (empty prior total)', () => {
    const r = nextGemmaStreamDelta('', 'Start')
    expect(r).toEqual({ delta: 'Start', emittedTotal: 'Start' })
  })
})
