import { describe, expect, it } from 'vitest'
import { migrateChatSettings } from '@/lib/chat/migrate-settings'

describe('chat settings from config.json', () => {
  it('leaves chat off when nothing was saved', () => {
    expect(migrateChatSettings(undefined)).toMatchObject({
      enabled: false,
      provider: null,
      model: '',
    })
  })

  it('treats an existing vault as off, and keeps its provider and model', () => {
    const s = migrateChatSettings({
      provider: 'anthropic',
      model: 'claude-x',
      maxContextChars: 9000,
    })
    expect(s).toMatchObject({
      enabled: false,
      provider: 'anthropic',
      model: 'claude-x',
      maxContextChars: 9000,
    })
  })

  it('keeps an explicit on', () => {
    expect(migrateChatSettings({ enabled: true, provider: 'ollama', model: 'm' }).enabled).toBe(
      true,
    )
  })

  it.each(['device', 'webllm', 'huggingface', 'nonsense'])(
    'chooses no provider where it was %s',
    (provider) => {
      const s = migrateChatSettings({ provider, model: 'gemma-4-e2b' })
      expect(s.provider).toBeNull()
      expect(s.model).toBe('')
    },
  )

  it('moves the one base URL to the provider it belonged to', () => {
    const s = migrateChatSettings({ provider: 'ollama', model: 'm', baseUrl: ' http://pc:11434 ' })
    expect(s.baseUrls).toEqual({ ollama: 'http://pc:11434' })
    expect('baseUrl' in s).toBe(false)
  })

  it('does not hand a base URL to a provider that was not chosen', () => {
    expect(
      migrateChatSettings({ provider: null, baseUrl: 'http://pc:11434' }).baseUrls,
    ).toBeUndefined()
  })

  it('keeps per-provider URLs already saved', () => {
    const s = migrateChatSettings({
      provider: 'openai',
      model: 'm',
      baseUrl: 'http://old',
      baseUrls: { openai: 'https://gateway/v1', ollama: 'http://pc:11434' },
    })
    expect(s.baseUrls).toEqual({ openai: 'https://gateway/v1', ollama: 'http://pc:11434' })
  })
})
