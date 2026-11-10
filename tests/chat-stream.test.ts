import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProvider } from '@/lib/chat/providers'
import type { ChatProviderId } from '@/types/chat'
import type { ChatStreamChunk } from '@/lib/chat/providers/types'

afterEach(() => vi.unstubAllGlobals())

function sse(lines: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines.join('\n') + '\n'))
      controller.close()
    },
  })
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, body })
  vi.stubGlobal('fetch', fn)
  return fn
}

async function run(id: ChatProviderId, apiKey: string, baseUrl?: string) {
  const out: ChatStreamChunk[] = []
  for await (const c of getProvider(id)!.streamChat({
    model: 'm',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey,
    baseUrl,
  })) {
    out.push(c)
  }
  return out
}

const delta = (s: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: s } }] })}`

describe('OpenAI-style streaming, shared by four providers', () => {
  it.each(['openai', 'openrouter', 'ollama', 'llamacpp'] as const)(
    '%s yields the deltas then done',
    async (id) => {
      sse([delta('Hel'), ': keep-alive', delta('lo'), 'data: [DONE]'])
      expect(await run(id, 'k')).toEqual([
        { type: 'delta', content: 'Hel' },
        { type: 'delta', content: 'lo' },
        { type: 'done' },
      ])
    },
  )

  it.each([
    ['ollama', 'http://pc:11434', 'http://pc:11434/v1/chat/completions'],
    ['ollama', 'http://pc:11434/v1', 'http://pc:11434/v1/chat/completions'],
    ['llamacpp', undefined, 'http://localhost:8080/v1/chat/completions'],
    ['openai', undefined, 'https://api.openai.com/v1/chat/completions'],
    ['openrouter', undefined, 'https://openrouter.ai/api/v1/chat/completions'],
  ] as const)('%s at %s posts to %s', async (id, base, url) => {
    const fn = sse(['data: [DONE]'])
    await run(id, '', base)
    expect(String(fn.mock.calls[0]![0])).toBe(url)
  })

  it('sends no Authorization header without a key, and one with', async () => {
    let fn = sse(['data: [DONE]'])
    await run('llamacpp', '')
    expect(
      (fn.mock.calls[0]![1] as { headers: Record<string, string> }).headers.Authorization,
    ).toBe(undefined)
    fn = sse(['data: [DONE]'])
    await run('llamacpp', 'secret')
    expect(
      (fn.mock.calls[0]![1] as { headers: Record<string, string> }).headers.Authorization,
    ).toBe('Bearer secret')
  })

  it('asks for token counts and passes them on before done', async () => {
    const usage = `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 7 } })}`
    const fn = sse([delta('Hi'), usage, 'data: [DONE]'])
    const out = await run('openai', 'k')
    expect(out).toEqual([
      { type: 'delta', content: 'Hi' },
      { type: 'usage', input: 120, output: 7 },
      { type: 'done' },
    ])
    const body = JSON.parse((fn.mock.calls[0]![1] as { body: string }).body)
    expect(body.stream_options).toEqual({ include_usage: true })
  })

  it('reports an HTTP error with the provider named', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key', body: null }),
    )
    expect(await run('openai', 'x')).toEqual([{ type: 'error', message: 'OpenAI 401: bad key' }])
  })
})
