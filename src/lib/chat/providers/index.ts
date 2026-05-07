/**
 * Provider registry.
 *
 * Each implementation maps the app's unified `ChatProvider` contract
 * onto its vendor-specific wire format. Adding a new provider is a
 * two-line change here plus the provider file itself — the UI and the
 * store never touch vendor code.
 *
 * Currently wired:
 *   - `openrouter` — OpenAI-compatible gateway; one key unlocks many models
 *   - `openai`     — api.openai.com `/v1/chat/completions`
 *   - `anthropic`  — api.anthropic.com `/v1/messages` (named SSE events)
 *   - `gemini`     — Generative Language API `:streamGenerateContent`
 *   - `ollama`     — localhost OpenAI-compatible endpoint (user-run server)
 *   - `device`     — MediaPipe Gemma 4 E2B (WebGPU, on-device)
 */

import type { ChatProviderId } from '@/types/chat'
import { anthropicProvider } from './anthropic'
import { geminiProvider } from './gemini'
import { ollamaProvider } from './ollama'
import { openaiProvider } from './openai'
import { openrouterProvider } from './openrouter'
import { deviceProvider } from './device'
import type { ChatProvider } from './types'

const PROVIDERS: Partial<Record<ChatProviderId, ChatProvider>> = {
  openrouter: openrouterProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  ollama: ollamaProvider,
  device: deviceProvider,
}

export function getProvider(id: ChatProviderId): ChatProvider | null {
  return PROVIDERS[id] ?? null
}

export function listAvailableProviders(): ChatProvider[] {
  return Object.values(PROVIDERS).filter((p): p is ChatProvider => Boolean(p))
}

export type { ChatProvider } from './types'
export { toWire } from './types'
