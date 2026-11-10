/**
 * Models, asked of the provider each time. Names change every few weeks, so
 * none are written down here: the list in Settings comes from the provider's
 * own models endpoint, or from the local server's.
 */

import type { ChatProviderId } from '@/types/chat'
import { ollamaDesktopHint } from './ollama'
import { plainBase, v1Base } from './openai-compat'
import { providerMeta } from './meta'

export interface ModelEntry {
  id: string
  label: string
}

const TIMEOUT_MS = 15_000

/** Not chat models: embeddings, speech, images, moderation. */
const NOT_CHAT =
  /embed|whisper|tts|dall-e|moderation|transcribe|realtime|image|audio|davinci|babbage/i

const byLabel = (a: ModelEntry, b: ModelEntry) => a.label.localeCompare(b.label)

async function getJson<T>(label: string, url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 200)
    } catch {
      /* swallow */
    }
    throw new Error(`${label} ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return (await res.json()) as T
}

type OpenAIList = { data?: { id: string; name?: string }[] }

function fromOpenAIList(json: OpenAIList, filter?: (id: string) => boolean): ModelEntry[] {
  return (json.data ?? [])
    .filter((m) => typeof m.id === 'string' && (!filter || filter(m.id)))
    .map((m) => ({ id: m.id, label: m.name?.trim() || m.id }))
    .sort(byLabel)
}

/**
 * The models a provider offers right now. Throws, with a message fit to show,
 * when the provider cannot be reached or refuses the key.
 */
export async function fetchModels(
  provider: ChatProviderId,
  apiKey: string,
  baseUrl?: string,
): Promise<ModelEntry[]> {
  const meta = providerMeta(provider)
  const bearer = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined

  switch (provider) {
    case 'openai': {
      const base = plainBase(baseUrl, meta.defaultBaseUrl)
      const json = await getJson<OpenAIList>('OpenAI', `${base}/models`, bearer)
      return fromOpenAIList(json, (id) => !NOT_CHAT.test(id))
    }
    case 'openrouter': {
      const base = plainBase(baseUrl, meta.defaultBaseUrl)
      const json = await getJson<OpenAIList>('OpenRouter', `${base}/models`, bearer)
      return fromOpenAIList(json)
    }
    case 'anthropic': {
      const base = plainBase(baseUrl, meta.defaultBaseUrl)
      const json = await getJson<{ data?: { id: string; display_name?: string }[] }>(
        'Anthropic',
        `${base}/models?limit=1000`,
        {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      )
      return (json.data ?? [])
        .map((m) => ({ id: m.id, label: m.display_name?.trim() || m.id }))
        .sort(byLabel)
    }
    case 'gemini': {
      const base = plainBase(baseUrl, meta.defaultBaseUrl)
      const json = await getJson<{
        models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]
      }>('Gemini', `${base}/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`)
      return (json.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => {
          const id = m.name.replace(/^models\//, '')
          return { id, label: m.displayName?.trim() || id }
        })
        .sort(byLabel)
    }
    case 'ollama':
    case 'llamacpp': {
      const base = v1Base(baseUrl, meta.defaultBaseUrl)
      try {
        const json = await getJson<OpenAIList>(meta.label, `${base}/models`, bearer)
        return fromOpenAIList(json)
      } catch (err) {
        if (
          err instanceof TypeError ||
          (err instanceof DOMException && err.name === 'TimeoutError')
        ) {
          const hint = provider === 'ollama' ? ollamaDesktopHint() : ''
          throw new Error(`Cannot reach ${meta.label} at ${base}.${hint}`)
        }
        throw err
      }
    }
  }
}
