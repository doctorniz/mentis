/**
 * Provider registry.
 *
 * Each implementation maps the app's `ChatProvider` contract onto one wire
 * format. The list is fixed; the models are not (see `model-catalog.ts`).
 *
 *   - `openrouter`, `openai`: OpenAI-style `/chat/completions`
 *   - `anthropic`: `/v1/messages`
 *   - `gemini`: `:streamGenerateContent`
 *   - `ollama`, `llamacpp`: a server the user runs, OpenAI-style under `/v1`
 */

import type { ChatProviderId } from '@/types/chat'
import { anthropicProvider } from './anthropic'
import { geminiProvider } from './gemini'
import { llamacppProvider } from './llamacpp'
import { ollamaProvider } from './ollama'
import { openaiProvider } from './openai'
import { openrouterProvider } from './openrouter'
import type { ChatProvider } from './types'

const PROVIDERS: Record<ChatProviderId, ChatProvider> = {
  openrouter: openrouterProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  ollama: ollamaProvider,
  llamacpp: llamacppProvider,
}

export function getProvider(id: ChatProviderId): ChatProvider | null {
  return PROVIDERS[id] ?? null
}

export type { ChatProvider } from './types'
export { toWire } from './types'
