import { describe, expect, it } from 'vitest'
import { migrateChatSettings } from '@/lib/chat/migrate-settings'
import { parsePickValue, pickValue, withoutPick, withPick } from '@/lib/chat/picks'
import { DEFAULT_CHAT_SETTINGS, type ChatSettings } from '@/types/chat'

const off: ChatSettings = { ...DEFAULT_CHAT_SETTINGS }
const a = { provider: 'ollama', model: 'qwen3:8b' } as const
const b = { provider: 'openai', model: 'gpt-x' } as const

describe('picked models', () => {
  it('the first one added is the one in use; later ones are not', () => {
    const one = withPick(off, a)
    expect(one).toMatchObject({ provider: 'ollama', model: 'qwen3:8b', picks: [a] })
    const two = withPick(one, b)
    expect(two.picks).toEqual([a, b])
    expect(two).toMatchObject({ provider: 'ollama', model: 'qwen3:8b' })
  })

  it('adding the same one twice keeps one', () => {
    expect(withPick(withPick(off, a), a).picks).toEqual([a])
  })

  it('removing the one in use puts the first left in use; the last one leaves none', () => {
    const two = withPick(withPick(off, a), b)
    const left = withoutPick(two, a)
    expect(left).toMatchObject({ provider: 'openai', model: 'gpt-x', picks: [b] })
    expect(withoutPick(left, b)).toMatchObject({ provider: null, model: '', picks: [] })
  })

  it('removing one not in use leaves the one in use alone', () => {
    const two = withPick(withPick(off, a), b)
    expect(withoutPick(two, b)).toMatchObject({ provider: 'ollama', model: 'qwen3:8b' })
  })

  it('a select value round-trips, including a model id with | in it', () => {
    expect(parsePickValue(pickValue(a))).toEqual(a)
    const odd = { provider: 'openrouter', model: 'a|b' } as const
    expect(parsePickValue(pickValue(odd))).toEqual(odd)
    expect(parsePickValue('nonsense')).toBeNull()
  })
})

describe('picks in config.json', () => {
  it('an older vault gets its chosen model as the only pick', () => {
    expect(migrateChatSettings({ provider: 'anthropic', model: 'claude-x' }).picks).toEqual([
      { provider: 'anthropic', model: 'claude-x' },
    ])
  })

  it('keeps saved picks, drops unknown providers and empty models, and adds the one in use', () => {
    const s = migrateChatSettings({
      provider: 'openai',
      model: 'gpt-x',
      picks: [
        { provider: 'ollama', model: 'm' },
        { provider: 'ollama', model: 'm' },
        { provider: 'device', model: 'gemma' },
        { provider: 'gemini', model: '' },
        null,
      ],
    })
    expect(s.picks).toEqual([
      { provider: 'ollama', model: 'm' },
      { provider: 'openai', model: 'gpt-x' },
    ])
  })

  it('has none where nothing was chosen', () => {
    expect(migrateChatSettings(undefined).picks).toEqual([])
  })
})
