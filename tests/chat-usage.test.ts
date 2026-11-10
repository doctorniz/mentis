import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProvider } from '@/lib/chat/providers'
import { migrateChatSettings } from '@/lib/chat/migrate-settings'
import { withoutPick, withPick } from '@/lib/chat/picks'
import {
  contextUse,
  contextWindowFor,
  estimateTokens,
  formatTokens,
  threadTotals,
} from '@/lib/chat/usage'
import { DEFAULT_CHAT_SETTINGS, type ChatMessage } from '@/types/chat'
import type { ChatStreamChunk } from '@/lib/chat/providers/types'

afterEach(() => vi.unstubAllGlobals())

const msg = (
  role: ChatMessage['role'],
  content: string,
  usage?: ChatMessage['usage'],
  error?: string,
): ChatMessage => ({
  id: Math.random().toString(),
  role,
  content,
  createdAt: '',
  ...(usage ? { usage } : {}),
  ...(error ? { error } : {}),
})

function sse(lines: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(lines.join('\n') + '\n'))
          c.close()
        },
      }),
    }),
  )
}

async function run(id: 'anthropic' | 'gemini') {
  const out: ChatStreamChunk[] = []
  for await (const c of getProvider(id)!.streamChat({
    model: 'm',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'k',
  })) {
    out.push(c)
  }
  return out
}

describe('token counts from the provider', () => {
  it('Anthropic: the request on message_start, the reply on message_delta', async () => {
    const d = (o: unknown) => `data: ${JSON.stringify(o)}`
    sse([
      d({
        type: 'message_start',
        message: {
          usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 1 },
        },
      }),
      d({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } }),
      d({ type: 'message_delta', usage: { output_tokens: 42 } }),
      d({ type: 'message_stop' }),
    ])
    expect(await run('anthropic')).toEqual([
      { type: 'delta', content: 'Hi' },
      { type: 'usage', input: 100, output: 42 },
      { type: 'done' },
    ])
  })

  it('Gemini: the last chunk’s totals', async () => {
    const d = (o: unknown) => `data: ${JSON.stringify(o)}`
    sse([
      d({
        candidates: [{ content: { parts: [{ text: 'a' }] } }],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 1 },
      }),
      d({
        candidates: [{ content: { parts: [{ text: 'b' }] } }],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 9 },
      }),
    ])
    const out = await run('gemini')
    expect(out.filter((c) => c.type === 'usage')).toEqual([{ type: 'usage', input: 50, output: 9 }])
    expect(out.at(-1)).toEqual({ type: 'done' })
  })

  it('a provider that reports nothing yields no usage', async () => {
    sse([`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }] } }] })}`])
    expect((await run('gemini')).some((c) => c.type === 'usage')).toBe(false)
  })
})

describe('how full the context is', () => {
  it('is the last answer’s request plus reply, counted by the provider', () => {
    const u = contextUse([
      msg('user', 'q1'),
      msg('assistant', 'a1', { input: 1000, output: 200 }),
      msg('user', 'q2'),
      msg('assistant', 'a2', { input: 1500, output: 300 }),
    ])
    expect(u).toEqual({ used: 1800, estimated: false })
  })

  it('estimates what came after the last count, and all of it before any', () => {
    const q = 'x'.repeat(400)
    expect(contextUse([msg('user', q)])).toEqual({ used: 100, estimated: true })
    expect(contextUse([msg('assistant', 'a', { input: 10, output: 5 }), msg('user', q)])).toEqual({
      used: 115,
      estimated: true,
    })
    expect(contextUse([])).toEqual({ used: 0, estimated: true })
  })

  it('leaves out an answer that failed', () => {
    expect(
      contextUse([
        msg('user', 'x'.repeat(40)),
        msg('assistant', 'x'.repeat(4000), undefined, 'boom'),
      ]),
    ).toEqual({ used: 10, estimated: true })
  })

  it('totals what the thread has spent, across models', () => {
    expect(
      threadTotals([
        msg('assistant', 'a', { input: 100, output: 10 }),
        msg('user', 'q'),
        msg('assistant', 'b', { input: 140, output: 20 }),
      ]),
    ).toEqual({ input: 240, output: 30 })
  })

  it('estimates four characters a token', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })

  it('writes counts short', () => {
    expect([950, 12_400, 200_000, 1_048_576].map(formatTokens)).toEqual([
      '950',
      '12.4k',
      '200k',
      '1M',
    ])
  })
})

describe('the window of a model', () => {
  const pick = { provider: 'ollama', model: 'qwen3:8b' } as const

  it('the one typed wins over the one reported; neither is unknown', () => {
    const typed = { contextWindows: { 'ollama|qwen3:8b': 32000 } }
    expect(contextWindowFor(typed, pick, 8192)).toBe(32000)
    expect(contextWindowFor({}, pick, 8192)).toBe(8192)
    expect(contextWindowFor({}, pick)).toBeUndefined()
  })

  it('is kept in config.json, minus anything that is not a number of tokens', () => {
    const s = migrateChatSettings({
      contextWindows: { 'a|b': 4096.4, 'c|d': 0, 'e|f': 'x', 'g|h': -5 },
    })
    expect(s.contextWindows).toEqual({ 'a|b': 4096 })
    expect(migrateChatSettings({}).contextWindows).toBeUndefined()
  })

  it('goes when its model is removed', () => {
    const base = withPick({ ...DEFAULT_CHAT_SETTINGS }, pick)
    const s = withoutPick({ ...base, contextWindows: { 'ollama|qwen3:8b': 32000 } }, pick)
    expect(s.contextWindows).toEqual({})
  })
})
