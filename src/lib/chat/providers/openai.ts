/**
 * OpenAI. `POST {base}/chat/completions`. Also reaches Azure OpenAI or any
 * other gateway with the same API, through a base URL.
 */

import { streamOpenAICompat } from './openai-compat'
import type { ChatProvider } from './types'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export const openaiProvider: ChatProvider = {
  id: 'openai',
  label: 'OpenAI',
  defaultBaseUrl: DEFAULT_BASE_URL,
  streamChat: (req) =>
    streamOpenAICompat(req, { label: 'OpenAI', defaultBaseUrl: DEFAULT_BASE_URL }),
}
