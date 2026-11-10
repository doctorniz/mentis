import { describe, expect, it } from 'vitest'
import {
  COMPACT_AT,
  KEEP_MESSAGES,
  compactThread,
  messagesAfterSummary,
  needsCompaction,
  planCut,
  summaryWire,
} from '@/lib/chat/compact'
import { contextUse, threadTotals } from '@/lib/chat/usage'
import type { ChatProvider, ChatStreamChunk } from '@/lib/chat/providers/types'
import type { ChatMessage, ChatThreadSummary } from '@/types/chat'

let n = 0
const msg = (
  role: ChatMessage['role'],
  content: string = role,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  id: `m${++n}`,
  role,
  content,
  createdAt: new Date(2026, 0, 1, 0, 0, n).toISOString(),
  ...extra,
})

/** u a u a … for `turns` exchanges. */
const convo = (turns: number, usage?: ChatMessage['usage']) =>
  Array.from({ length: turns }, () => [
    msg('user'),
    msg('assistant', 'assistant', usage ? { usage } : {}),
  ]).flat()

const summaryOf = (
  upTo: ChatMessage,
  extra: Partial<ChatThreadSummary> = {},
): ChatThreadSummary => ({
  content: 'SUM',
  upToMessageId: upTo.id,
  overhead: 500,
  createdAt: new Date(2026, 0, 2).toISOString(),
  ...extra,
})

function fakeProvider(reply: string, usage?: { input: number; output: number }) {
  const seen: { messages: { role: string; content: string }[] }[] = []
  const provider: ChatProvider = {
    id: 'openai',
    label: 'Fake',
    defaultBaseUrl: '',
    async *streamChat(req) {
      seen.push({ messages: req.messages })
      yield { type: 'delta', content: reply.slice(0, 2) } satisfies ChatStreamChunk
      yield { type: 'delta', content: reply.slice(2) } satisfies ChatStreamChunk
      if (usage) yield { type: 'usage', ...usage }
      yield { type: 'done' }
    },
  }
  return { provider, seen }
}

describe('where to cut', () => {
  it('keeps the newest messages and starts the kept ones at a question', () => {
    const m = convo(5)
    const cut = planCut(m, undefined)!
    const i = m.indexOf(cut)
    expect(m.length - (i + 1)).toBeGreaterThanOrEqual(KEEP_MESSAGES)
    expect(m[i + 1]!.role).toBe('user')
  })

  it('has nothing to cut in a short conversation', () => {
    expect(planCut(convo(2), undefined)).toBeNull()
    expect(planCut([], undefined)).toBeNull()
  })

  it('cuts after an earlier cut, never before it', () => {
    const m = convo(6)
    const first = summaryOf(m[1]!)
    const cut = planCut(m, first)!
    expect(m.indexOf(cut)).toBeGreaterThan(1)
    expect(planCut(m, summaryOf(cut))).toBeNull()
  })
})

describe('when to summarise', () => {
  const full = convo(4, { input: 800, output: 100 }) // counted: 900

  it('not without a known window', () => {
    expect(needsCompaction(full, undefined, undefined, 'next')).toBe(false)
  })

  it('once the next request would pass the line', () => {
    expect(needsCompaction(full, undefined, 1000, 'next')).toBe(true) // 900 > 800
    expect(needsCompaction(full, undefined, 2000, 'next')).toBe(false)
    expect(COMPACT_AT).toBe(0.8)
  })

  it('counts the question about to be sent', () => {
    const edge = Math.ceil(900 / COMPACT_AT)
    expect(needsCompaction(full, undefined, edge, '')).toBe(false)
    expect(needsCompaction(full, undefined, edge, 'x'.repeat(4000))).toBe(true)
  })

  it('not when there is nothing to cut, however full', () => {
    expect(needsCompaction(convo(1, { input: 900, output: 90 }), undefined, 1000, 'q')).toBe(false)
  })
})

describe('after a summary', () => {
  it('requests carry only the messages after it, and the summary as an instruction', () => {
    const m = convo(5)
    const s = summaryOf(m[3]!)
    expect(messagesAfterSummary(m, s)).toEqual(m.slice(4))
    expect(messagesAfterSummary(m, undefined)).toBe(m)
    expect(summaryWire(s)).toEqual([
      { role: 'system', content: 'Summary of the earlier conversation:\n\nSUM' },
    ])
    expect(summaryWire(undefined)).toEqual([])
  })

  it('the old counts say nothing; the size is the overhead, the summary and what is kept', () => {
    const m = convo(5, { input: 9000, output: 100 })
    const s = summaryOf(m[5]!, { content: 'x'.repeat(400), createdAt: '2999-01-01T00:00:00Z' })
    const kept = messagesAfterSummary(m, s)
    const rest = kept.reduce((t, k) => t + Math.ceil(k.content.length / 4), 0)
    expect(contextUse(m, s)).toEqual({ used: 500 + 100 + rest, estimated: true })
  })

  it('an answer given after the summary is counted again', () => {
    const m = convo(5, { input: 9000, output: 100 })
    const s = summaryOf(m[5]!, { createdAt: '2000-01-01T00:00:00Z' })
    const after = msg('assistant', 'new', { usage: { input: 700, output: 50 } })
    after.createdAt = '2030-01-01T00:00:00Z'
    expect(contextUse([...m, after], s)).toEqual({ used: 750, estimated: false })
  })

  it('the summary’s own cost counts toward the thread’s', () => {
    const m = [msg('assistant', 'a', { usage: { input: 10, output: 5 } })]
    expect(threadTotals(m, summaryOf(m[0]!, { usage: { input: 100, output: 20 } }))).toEqual({
      input: 110,
      output: 25,
    })
  })
})

describe('writing the summary', () => {
  it('asks the model for the older messages only, and keeps what it said', async () => {
    const m = convo(5, { input: 1300, output: 100 })
    m[0]!.content = 'FIRST QUESTION'
    const { provider, seen } = fakeProvider('  the gist  ', { input: 300, output: 20 })
    const s = (await compactThread({
      provider,
      model: 'm',
      apiKey: 'k',
      messages: m,
      summary: undefined,
    }))!
    expect(s.content).toBe('the gist')
    expect(s.usage).toEqual({ input: 300, output: 20 })
    const cutAt = m.findIndex((x) => x.id === s.upToMessageId)
    expect(m.length - (cutAt + 1)).toBeGreaterThanOrEqual(KEEP_MESSAGES)
    const body = seen[0]!.messages[1]!.content
    expect(body).toContain('FIRST QUESTION')
    expect(seen[0]!.messages[0]!.role).toBe('system')
    // overhead: the counted request (1300) less the 8 messages of 'user'/'assistant' words before it
    expect(s.overhead).toBeGreaterThan(1200)
  })

  it('folds the earlier summary in', async () => {
    const m = convo(7)
    const { provider, seen } = fakeProvider('newer')
    const earlier = summaryOf(m[1]!, { content: 'EARLIER GIST' })
    const s = (await compactThread({
      provider,
      model: 'm',
      apiKey: 'k',
      messages: m,
      summary: earlier,
    }))!
    expect(seen[0]!.messages[1]!.content).toContain('EARLIER GIST')
    expect(m.findIndex((x) => x.id === s.upToMessageId)).toBeGreaterThan(1)
  })

  it('says nothing is to be done for a short conversation, and throws on a provider error', async () => {
    const { provider } = fakeProvider('x')
    expect(
      await compactThread({
        provider,
        model: 'm',
        apiKey: 'k',
        messages: convo(1),
        summary: undefined,
      }),
    ).toBeNull()

    const failing: ChatProvider = {
      ...provider,
      async *streamChat() {
        yield { type: 'error', message: 'boom' }
      },
    }
    await expect(
      compactThread({
        provider: failing,
        model: 'm',
        apiKey: 'k',
        messages: convo(5),
        summary: undefined,
      }),
    ).rejects.toThrow('boom')
  })
})
