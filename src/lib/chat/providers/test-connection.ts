/**
 * Per-provider connection test.
 *
 * `testConnection` makes a lightweight API call to verify the key works.
 * Cloud providers hit their models/list endpoint. Local/browser providers
 * check runtime availability. Returns `{ ok: true }` or `{ ok: false, error }`.
 */

import type { ChatProviderId } from '@/types/chat'

export interface TestResult {
  ok: boolean
  error?: string
}

/* ------------------------------------------------------------------ */
/*  OpenAI-compatible (OpenAI, OpenRouter)                               */
/* ------------------------------------------------------------------ */

async function testOpenAICompat(
  apiKey: string,
  baseUrl: string,
  label: string,
): Promise<TestResult> {
  try {
    const base = baseUrl.replace(/\/$/, '')
    const res = await fetch(`${base}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) return { ok: true }
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 300)
    } catch {
      /* swallow */
    }
    return {
      ok: false,
      error: `${label} returned ${res.status}${detail ? `: ${detail}` : ''}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Network error: ${msg}` }
  }
}

/* ------------------------------------------------------------------ */
/*  Anthropic                                                          */
/* ------------------------------------------------------------------ */

async function testAnthropic(
  apiKey: string,
  baseUrl?: string,
): Promise<TestResult> {
  const base = (baseUrl?.trim() || 'https://api.anthropic.com/v1').replace(/\/$/, '')
  try {
    // Try the models endpoint first
    const res = await fetch(`${base}/models?limit=1`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) return { ok: true }
    // Anthropic might return 404 for /models but the key could still be valid.
    // Try a tiny messages call with max_tokens=1 as fallback.
    if (res.status === 404) {
      const msgRes = await fetch(`${base}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        signal: AbortSignal.timeout(15_000),
      })
      // 200 or 429 (rate limited) both prove the key is valid
      if (msgRes.ok || msgRes.status === 429) return { ok: true }
      let detail = ''
      try {
        detail = (await msgRes.text()).slice(0, 300)
      } catch {
        /* swallow */
      }
      return {
        ok: false,
        error: `Anthropic returned ${msgRes.status}${detail ? `: ${detail}` : ''}`,
      }
    }
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 300)
    } catch {
      /* swallow */
    }
    return {
      ok: false,
      error: `Anthropic returned ${res.status}${detail ? `: ${detail}` : ''}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Network error: ${msg}` }
  }
}

/* ------------------------------------------------------------------ */
/*  Gemini                                                             */
/* ------------------------------------------------------------------ */

async function testGemini(
  apiKey: string,
  baseUrl?: string,
): Promise<TestResult> {
  const base = (baseUrl?.trim() || 'https://generativelanguage.googleapis.com/v1beta').replace(
    /\/$/,
    '',
  )
  try {
    const res = await fetch(
      `${base}/models?key=${encodeURIComponent(apiKey)}&pageSize=1`,
      { signal: AbortSignal.timeout(15_000) },
    )
    if (res.ok) return { ok: true }
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 300)
    } catch {
      /* swallow */
    }
    return {
      ok: false,
      error: `Gemini returned ${res.status}${detail ? `: ${detail}` : ''}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Network error: ${msg}` }
  }
}

/* ------------------------------------------------------------------ */
/*  Ollama                                                             */
/* ------------------------------------------------------------------ */

async function testOllama(
  _apiKey: string,
  baseUrl?: string,
): Promise<TestResult> {
  const base = (baseUrl?.trim() || 'http://localhost:11434').replace(/\/$/, '')
  try {
    // Try native Ollama tags endpoint
    const res = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) return { ok: true }
  } catch {
    /* try OpenAI compat */
  }
  try {
    const v1Base = base.endsWith('/v1') ? base : `${base}/v1`
    const res = await fetch(`${v1Base}/models`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) return { ok: true }
    return {
      ok: false,
      error: `Cannot reach Ollama at ${base}. Is \`ollama serve\` running?`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: `Cannot reach Ollama at ${base}: ${msg}`,
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Local / Gemma 4 E2B via MediaPipe                                   */
/* ------------------------------------------------------------------ */

function testDevice(): TestResult {
  if (typeof navigator === 'undefined') {
    return { ok: false, error: 'Not in a browser environment.' }
  }
  const hasGpu = typeof (navigator as Navigator & { gpu?: unknown }).gpu !== 'undefined'
  if (!hasGpu) {
    return {
      ok: false,
      error:
        'WebGPU not available. Local mode requires Chrome, Edge, or a recent Chromium build.',
    }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function testConnection(
  provider: ChatProviderId,
  apiKey: string,
  baseUrl?: string,
): Promise<TestResult> {
  switch (provider) {
    case 'openai':
      return testOpenAICompat(
        apiKey,
        baseUrl?.trim() || 'https://api.openai.com/v1',
        'OpenAI',
      )
    case 'openrouter':
      return testOpenAICompat(
        apiKey,
        baseUrl?.trim() || 'https://openrouter.ai/api/v1',
        'OpenRouter',
      )
    case 'anthropic':
      return testAnthropic(apiKey, baseUrl)
    case 'gemini':
      return testGemini(apiKey, baseUrl)
    case 'ollama':
      return testOllama(apiKey, baseUrl)
    case 'device':
      return testDevice()
    default:
      return { ok: false, error: `Unknown provider: ${provider}` }
  }
}
