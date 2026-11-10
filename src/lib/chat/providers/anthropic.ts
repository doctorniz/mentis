/**
 * Anthropic (Claude) direct provider.
 *
 * Calls `POST {base}/messages` with `stream: true`. Anthropic's message
 * shape differs from OpenAI:
 *   - `system` is a top-level field, NOT a role in `messages`
 *   - assistant role is literally `assistant` (same as OpenAI)
 *   - SSE events are named: `message_start`, `content_block_delta`,
 *     `message_stop`, etc. We only care about `content_block_delta`
 *     with `delta.type === 'text_delta'` — we extract `delta.text`.
 *
 * Browser CORS: Anthropic requires an opt-in header
 * `anthropic-dangerous-direct-browser-access: true` for direct in-browser
 * calls. We surface that in the request; users running a CORS proxy can
 * override `baseUrl` in Settings.
 */

import type { ChatCompletionRequest, ChatProvider, ChatStreamChunk } from './types'

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1'
const DEFAULT_MAX_TOKENS = 4096

type AnthropicUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

async function* streamAnthropic(req: ChatCompletionRequest): AsyncGenerator<ChatStreamChunk> {
  const base = (req.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '')
  const url = `${base}/messages`

  // Split out the single system message; Anthropic expects it top-level.
  const systemParts = req.messages.filter((m) => m.role === 'system').map((m) => m.content)
  const system = systemParts.join('\n\n')
  const convo = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: req.model,
        system: system || undefined,
        messages: convo,
        max_tokens: DEFAULT_MAX_TOKENS,
        stream: true,
      }),
      signal: req.signal,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    yield { type: 'error', message: `Network error: ${msg}` }
    return
  }

  if (!res.ok || !res.body) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 500)
    } catch {
      /* swallow */
    }
    yield {
      type: 'error',
      message: `Anthropic ${res.status}${detail ? `: ${detail}` : ''}`,
    }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  // The request's tokens arrive with message_start, the reply's with message_delta.
  let input = 0
  let output = 0
  let sawUsage = false
  const usageChunk = (): ChatStreamChunk[] => (sawUsage ? [{ type: 'usage', input, output }] : [])

  try {
    while (true) {
      if (req.signal?.aborted) {
        yield { type: 'error', message: 'Cancelled' }
        return
      }
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, '')
        buffer = buffer.slice(nl + 1)
        // Anthropic emits `event: <name>` lines and `data: <json>` lines.
        // We ignore the `event:` framing — matching on JSON shape keeps
        // the parser forward-compatible with new event types.
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        try {
          const json = JSON.parse(payload) as {
            type?: string
            delta?: { type?: string; text?: string }
            error?: { message?: string }
            message?: { usage?: AnthropicUsage }
            usage?: AnthropicUsage
          }
          if (json.type === 'message_start' && json.message?.usage) {
            const u = json.message.usage
            input =
              (u.input_tokens ?? 0) +
              (u.cache_creation_input_tokens ?? 0) +
              (u.cache_read_input_tokens ?? 0)
            output = u.output_tokens ?? 0
            sawUsage = true
          } else if (json.type === 'message_delta' && json.usage) {
            if (typeof json.usage.output_tokens === 'number') output = json.usage.output_tokens
            sawUsage = true
          }
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            const delta = json.delta.text
            if (typeof delta === 'string' && delta.length > 0) {
              yield { type: 'delta', content: delta }
            }
          } else if (json.type === 'message_stop') {
            yield* usageChunk()
            yield { type: 'done' }
            return
          } else if (json.type === 'error' && json.error?.message) {
            yield { type: 'error', message: json.error.message }
            return
          }
        } catch {
          /* swallow malformed chunks — keep-alives, partial frames */
        }
      }
    }
    yield* usageChunk()
    yield { type: 'done' }
  } catch (err) {
    if (req.signal?.aborted) {
      yield { type: 'error', message: 'Cancelled' }
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    yield { type: 'error', message: `Stream error: ${msg}` }
  } finally {
    try {
      await reader.cancel()
    } catch {
      /* swallow */
    }
  }
}

export const anthropicProvider: ChatProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  defaultBaseUrl: DEFAULT_BASE_URL,
  streamChat: streamAnthropic,
}
