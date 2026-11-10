/**
 * llama.cpp's `llama-server`, on this machine or the network. It serves the
 * OpenAI API under `/v1`; the base URL may be typed with or without it. A key
 * is sent only when one is set (`--api-key`).
 */

import { streamOpenAICompat, v1Base } from './openai-compat'
import type { ChatProvider } from './types'

const DEFAULT_BASE_URL = 'http://localhost:8080'

export const llamacppProvider: ChatProvider = {
  id: 'llamacpp',
  label: 'llama.cpp',
  defaultBaseUrl: DEFAULT_BASE_URL,
  streamChat: (req) =>
    streamOpenAICompat(req, {
      label: 'llama.cpp',
      defaultBaseUrl: DEFAULT_BASE_URL,
      resolveBase: v1Base,
      unreachableHint: () => '',
    }),
}
