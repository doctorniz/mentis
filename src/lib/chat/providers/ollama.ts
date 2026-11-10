/**
 * Ollama, running on this machine or another one on the network. Its
 * OpenAI-compatible API lives under `/v1`; the base URL may be typed with or
 * without it. No key is needed, but one is sent when set, for setups that put
 * a proxy in front.
 */

import { isTauri } from '@/lib/fs/platform'
import { streamOpenAICompat, v1Base } from './openai-compat'
import type { ChatProvider } from './types'

const DEFAULT_BASE_URL = 'http://localhost:11434'

/**
 * Added to "cannot reach Ollama" errors in the desktop and phone apps. A
 * request the server refuses for its origin fails exactly like one that never
 * connected, and Ollama only trusts some origins by default. Names this
 * app's own origin (`http://tauri.localhost` on Windows and Android), never
 * `*`, which would let every website use Ollama.
 */
export function ollamaDesktopHint(): string {
  return isTauri()
    ? ` Ollama must also allow this app: set OLLAMA_ORIGINS=${window.location.origin} and restart Ollama.`
    : ''
}

export const ollamaProvider: ChatProvider = {
  id: 'ollama',
  label: 'Ollama',
  defaultBaseUrl: DEFAULT_BASE_URL,
  streamChat: (req) =>
    streamOpenAICompat(req, {
      label: 'Ollama',
      defaultBaseUrl: DEFAULT_BASE_URL,
      resolveBase: v1Base,
      unreachableHint: ollamaDesktopHint,
    }),
}
