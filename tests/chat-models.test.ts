import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchModels } from '@/lib/chat/providers/model-catalog'
import { effectiveBaseUrl, providerNeedsApiKey } from '@/lib/chat/providers/meta'
import { plainBase, v1Base } from '@/lib/chat/providers/openai-compat'
import { testConnection } from '@/lib/chat/providers/test-connection'

afterEach(() => vi.unstubAllGlobals())

function respond(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const lastUrl = (fn: ReturnType<typeof vi.fn>) => String(fn.mock.calls.at(-1)![0])
const lastHeaders = (fn: ReturnType<typeof vi.fn>) =>
  (fn.mock.calls.at(-1)![1] as { headers?: Record<string, string> }).headers ?? {}

describe('base URLs', () => {
  it('local servers get /v1 whether or not it was typed', () => {
    expect(v1Base('http://pc:11434', 'x')).toBe('http://pc:11434/v1')
    expect(v1Base('http://pc:11434/', 'x')).toBe('http://pc:11434/v1')
    expect(v1Base('http://pc:11434/v1', 'x')).toBe('http://pc:11434/v1')
    expect(v1Base('http://pc:11434/v1/', 'x')).toBe('http://pc:11434/v1')
    expect(v1Base('  ', 'http://localhost:8080')).toBe('http://localhost:8080/v1')
  })

  it('cloud providers use the base as typed', () => {
    expect(plainBase('https://gateway/v1/', 'x')).toBe('https://gateway/v1')
    expect(plainBase(undefined, 'https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
  })

  it('each provider has its own address', () => {
    const urls = { ollama: 'http://pc:11434' }
    expect(effectiveBaseUrl('ollama', urls)).toBe('http://pc:11434')
    expect(effectiveBaseUrl('openai', urls)).toBe('https://api.openai.com/v1')
    expect(effectiveBaseUrl('llamacpp', urls)).toBe('http://localhost:8080')
  })

  it('only cloud providers need a key', () => {
    expect(providerNeedsApiKey('openai')).toBe(true)
    expect(providerNeedsApiKey('gemini')).toBe(true)
    expect(providerNeedsApiKey('ollama')).toBe(false)
    expect(providerNeedsApiKey('llamacpp')).toBe(false)
  })
})

describe('model lists come from the provider', () => {
  it('OpenAI: chat models only, sorted, with the key', async () => {
    const fn = respond({
      data: [
        { id: 'text-embedding-3-small' },
        { id: 'gpt-zzz' },
        { id: 'whisper-1' },
        { id: 'dall-e-3' },
        { id: 'gpt-aaa' },
      ],
    })
    const models = await fetchModels('openai', 'sk-1')
    expect(models.map((m) => m.id)).toEqual(['gpt-aaa', 'gpt-zzz'])
    expect(lastUrl(fn)).toBe('https://api.openai.com/v1/models')
    expect(lastHeaders(fn).Authorization).toBe('Bearer sk-1')
  })

  it('OpenRouter: every model, named', async () => {
    respond({ data: [{ id: 'b/x', name: 'Beta' }, { id: 'a/y', name: 'Alpha' }, { id: 'c/z' }] })
    const models = await fetchModels('openrouter', '')
    expect(models).toEqual([
      { id: 'a/y', label: 'Alpha' },
      { id: 'b/x', label: 'Beta' },
      { id: 'c/z', label: 'c/z' },
    ])
  })

  it('Anthropic: asks with its headers, no list of its own to fall back on', async () => {
    const fn = respond({ data: [{ id: 'claude-1', display_name: 'Claude One' }] })
    expect(await fetchModels('anthropic', 'sk-ant')).toEqual([
      { id: 'claude-1', label: 'Claude One' },
    ])
    expect(lastHeaders(fn)['x-api-key']).toBe('sk-ant')
    respond({ error: 'no' }, 401)
    await expect(fetchModels('anthropic', 'bad')).rejects.toThrow(/Anthropic 401/)
  })

  it('Gemini: models that can generate content, without the models/ prefix', async () => {
    const fn = respond({
      models: [
        { name: 'models/embed-1', supportedGenerationMethods: ['embedContent'] },
        {
          name: 'models/gem-1',
          displayName: 'Gem 1',
          supportedGenerationMethods: ['generateContent'],
        },
      ],
    })
    expect(await fetchModels('gemini', 'k 1')).toEqual([{ id: 'gem-1', label: 'Gem 1' }])
    expect(lastUrl(fn)).toContain('key=k%201')
  })

  it.each([
    ['ollama', 'http://pc:11434', 'http://pc:11434/v1/models'],
    ['ollama', 'http://pc:11434/v1', 'http://pc:11434/v1/models'],
    ['ollama', undefined, 'http://localhost:11434/v1/models'],
    ['llamacpp', undefined, 'http://localhost:8080/v1/models'],
    ['llamacpp', 'http://box:9000/', 'http://box:9000/v1/models'],
  ] as const)('%s at %s asks %s', async (provider, base, url) => {
    const fn = respond({ data: [{ id: 'llama3' }] })
    expect(await fetchModels(provider, '', base)).toEqual([{ id: 'llama3', label: 'llama3' }])
    expect(lastUrl(fn)).toBe(url)
    expect(lastHeaders(fn).Authorization).toBeUndefined()
  })

  it('a local server gets the key only when one was saved', async () => {
    const fn = respond({ data: [] })
    await fetchModels('llamacpp', 'secret')
    expect(lastHeaders(fn).Authorization).toBe('Bearer secret')
  })

  it('says so when a local server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchModels('llamacpp', '')).rejects.toThrow(
      'Cannot reach llama.cpp at http://localhost:8080/v1.',
    )
  })

  it('testConnection is the model list succeeding', async () => {
    respond({ data: [{ id: 'm' }] })
    expect(await testConnection('ollama', '')).toEqual({
      ok: true,
      models: [{ id: 'm', label: 'm' }],
    })
    respond({}, 500)
    const bad = await testConnection('openai', 'x')
    expect(bad.ok).toBe(false)
    expect(bad.error).toContain('OpenAI 500')
  })
})
