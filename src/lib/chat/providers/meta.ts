/**
 * The providers chat offers: a fixed list. Their models are not listed here —
 * those come from each provider's own API (see `model-catalog.ts`).
 */

import type { ChatProviderId } from '@/types/chat'

export interface ProviderMeta {
  id: ChatProviderId
  label: string
  /** A hint under the provider picker, only where it prevents a mistake. */
  hint?: string
  /** `required`: cloud. `optional`: a local server, usually open. */
  key: 'required' | 'optional'
  keyPlaceholder: string
  defaultBaseUrl: string
  /** Runs on this machine or the user's network. */
  local: boolean
}

export const PROVIDERS_META: readonly ProviderMeta[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    key: 'required',
    keyPlaceholder: 'sk-or-v1-…',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    local: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    key: 'required',
    keyPlaceholder: 'sk-ant-…',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    local: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    key: 'required',
    keyPlaceholder: 'sk-…',
    defaultBaseUrl: 'https://api.openai.com/v1',
    local: false,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    key: 'required',
    keyPlaceholder: 'AIza…',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    local: false,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    hint: 'Run `ollama serve`. For another machine, use its address, e.g. http://192.168.1.5:11434.',
    key: 'optional',
    keyPlaceholder: '(optional)',
    defaultBaseUrl: 'http://localhost:11434',
    local: true,
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp',
    hint: 'Run `llama-server -m <model.gguf>`.',
    key: 'optional',
    keyPlaceholder: '(optional)',
    defaultBaseUrl: 'http://localhost:8080',
    local: true,
  },
]

export function providerMeta(id: ChatProviderId): ProviderMeta {
  return PROVIDERS_META.find((p) => p.id === id)!
}

/** Whether chatting needs a key. Local servers do not. */
export function providerNeedsApiKey(id: ChatProviderId): boolean {
  return providerMeta(id).key === 'required'
}

/** The URL requests go to: the one saved for this provider, else its default. */
export function effectiveBaseUrl(
  id: ChatProviderId,
  baseUrls: Partial<Record<ChatProviderId, string>> | undefined,
): string {
  return baseUrls?.[id]?.trim() || providerMeta(id).defaultBaseUrl
}
