/**
 * The OpenAI `/chat/completions` wire format, shared by every provider that
 * speaks it: OpenAI, OpenRouter, and the local servers (Ollama, llama.cpp).
 *
 * SSE: one `data: {json}` line per delta, ended by `data: [DONE]`. The text of
 * each delta is `choices[0].delta.content`.
 */

import type { ChatCompletionRequest, ChatStreamChunk } from './types'

type Usage = { prompt_tokens?: number; completion_tokens?: number }

export interface OpenAICompatOptions {
  /** Shown in errors: "OpenAI 401: …". */
  label: string
  defaultBaseUrl: string
  /** Sent in addition to Content-Type and Authorization. */
  headers?: Record<string, string>
  /** The server is local: add a hint to "cannot reach" errors. */
  unreachableHint?: (base: string) => string
  /** Turn the base the user typed into the one requests go to. */
  resolveBase?: (typed: string | undefined, fallback: string) => string
}

/** The base a user typed, or the default, without a trailing slash. */
export function plainBase(typed: string | undefined, fallback: string): string {
  return (typed?.trim() || fallback).replace(/\/+$/, '')
}

/**
 * Local servers publish the OpenAI API under `/v1`; people type the host with
 * or without it. Both end up at `…/v1`.
 */
export function v1Base(typed: string | undefined, fallback: string): string {
  const base = plainBase(typed, fallback)
  return /\/v1$/.test(base) ? base : `${base}/v1`
}

export async function* streamOpenAICompat(
  req: ChatCompletionRequest,
  opts: OpenAICompatOptions,
): AsyncGenerator<ChatStreamChunk> {
  const base = (opts.resolveBase ?? plainBase)(req.baseUrl, opts.defaultBaseUrl)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...opts.headers,
  }
  if (req.apiKey) headers.Authorization = `Bearer ${req.apiKey}`

  let res: Response
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: req.signal,
    })
  } catch (err) {
    if (req.signal?.aborted) {
      yield { type: 'error', message: 'Cancelled' }
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    yield {
      type: 'error',
      message: opts.unreachableHint
        ? `Could not reach ${opts.label} at ${base} — is the server running? (${msg})${opts.unreachableHint(base)}`
        : `Network error: ${msg}`,
    }
    return
  }

  if (!res.ok || !res.body) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 500)
    } catch {
      /* swallow */
    }
    yield { type: 'error', message: `${opts.label} ${res.status}${detail ? `: ${detail}` : ''}` }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let usage: { input: number; output: number } | null = null

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
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        if (payload === '[DONE]') {
          if (usage) yield { type: 'usage', ...usage }
          yield { type: 'done' }
          return
        }
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[]
            usage?: Usage | null
          }
          if (json.usage && typeof json.usage.prompt_tokens === 'number') {
            usage = { input: json.usage.prompt_tokens, output: json.usage.completion_tokens ?? 0 }
          }
          const delta = json.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta.length > 0) {
            yield { type: 'delta', content: delta }
          }
        } catch {
          /* a keep-alive or partial line: skip it */
        }
      }
    }
    if (usage) yield { type: 'usage', ...usage }
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
