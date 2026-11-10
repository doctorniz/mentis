/**
 * OpenRouter: one OpenAI-compatible gateway in front of many models.
 */

import { streamOpenAICompat } from './openai-compat'
import type { ChatProvider } from './types'

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'

export const openrouterProvider: ChatProvider = {
  id: 'openrouter',
  label: 'OpenRouter',
  defaultBaseUrl: DEFAULT_BASE_URL,
  streamChat: (req) =>
    streamOpenAICompat(req, {
      label: 'OpenRouter',
      defaultBaseUrl: DEFAULT_BASE_URL,
      // Optional; OpenRouter uses them to attribute traffic.
      headers: {
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
        'X-Title': 'Mentis',
      },
    }),
}
