/**
 * WebLLM (WebGPU, in-browser) provider.
 *
 * Loads a quantized model into the browser via `@mlc-ai/web-llm` and runs
 * inference on WebGPU. First use of a given model id downloads the
 * weights (commonly 1–3 GB for 4B models) into the browser cache; reuses
 * are fast. Exposes an OpenAI-compatible `engine.chat.completions.create`
 * with `stream: true`.
 *
 * Design notes:
 * - The `@mlc-ai/web-llm` package is imported lazily via dynamic
 *   `import()` so it never lands in the main bundle. Static export
 *   (`output: 'export'`) still works because the dynamic import is
 *   client-only.
 * - We cache the `MLCEngine` per-model in module scope. Switching models
 *   creates a new engine; this is expensive, so users should pick one
 *   model and stick with it.
 * - Default model is `gemma-3-4b-it-q4f16_1-MLC` (satisfies the
 *   user-requested "Gemma 4B"). Other MLC-packaged models are selectable
 *   by editing `ChatSettings.model`; see https://mlc.ai/models for the
 *   catalog.
 * - Progress events during first-time model load surface via a custom
 *   event (`ink:webllm-progress`) so the UI can show a toast. We keep
 *   the provider itself UI-free.
 *
 * Requires WebGPU; users on Safari / older Chromium fall through to a
 * clear error message.
 */

import type {
  ChatCompletionRequest,
  ChatProvider,
  ChatStreamChunk,
  WireMessage,
} from './types'

// Typed subset of the web-llm API surface we touch. The real package
// ships types, but we avoid the dep at type-level so the codebase
// typechecks before `pnpm install @mlc-ai/web-llm` has been run.
interface MlcInitProgress {
  progress: number
  text: string
}

interface MlcChatDelta {
  choices?: { delta?: { content?: string } }[]
}

interface MlcEngine {
  chat: {
    completions: {
      create: (opts: {
        messages: WireMessage[]
        stream: true
      }) => Promise<AsyncIterable<MlcChatDelta>>
    }
  }
  interruptGenerate?: () => void
}

interface MlcEngineInit {
  initProgressCallback?: (p: MlcInitProgress) => void
  /** Increase the KV-cache context window beyond the model default. */
  chatOpts?: { context_window_size?: number; sliding_window_size?: number }
}

interface MlcModule {
  CreateMLCEngine: (
    modelId: string,
    init?: MlcEngineInit,
  ) => Promise<MlcEngine>
}

export const DEFAULT_WEBLLM_MODEL = 'gemma-3-4b-it-q4f16_1-MLC'

/**
 * Conservative token budget for WebLLM requests. MLC small models are
 * compiled with a 4 096-token hard ceiling that cannot be overridden at
 * runtime. We reserve ~600 tokens for the assistant response and keep the
 * rest for system + history. The rough heuristic is 4 chars ≈ 1 token.
 */
const WEBLLM_MAX_PROMPT_CHARS = 3500 * 4 // ≈ 3 500 tokens

/**
 * Trim the `<document …>…</document>` block inside the system message so
 * the full prompt stays within `WEBLLM_MAX_PROMPT_CHARS`. Other messages
 * are left untouched; if there is no document block the messages are
 * returned as-is.
 */
function fitToContextWindow(messages: WireMessage[]): WireMessage[] {
  const totalChars = messages.reduce(
    (n, m) => n + (typeof m.content === 'string' ? m.content.length : 0),
    0,
  )
  if (totalChars <= WEBLLM_MAX_PROMPT_CHARS) return messages

  const sysIdx = messages.findIndex((m) => m.role === 'system')
  if (sysIdx === -1 || typeof messages[sysIdx].content !== 'string') return messages

  const sys = messages[sysIdx].content as string
  const docOpen = sys.indexOf('<document')
  const docClose = sys.lastIndexOf('</document>')
  if (docOpen === -1 || docClose === -1) return messages

  // How many characters we need to shed from the document block.
  const excess = totalChars - WEBLLM_MAX_PROMPT_CHARS
  const docBlock = sys.slice(docOpen, docClose + '</document>'.length)
  const allowedDocLen = Math.max(200, docBlock.length - excess)
  const trimmedDoc =
    docBlock.slice(0, allowedDocLen) +
    '\n[… truncated to fit context window …]</document>'

  const newSys =
    sys.slice(0, docOpen) +
    trimmedDoc +
    sys.slice(docClose + '</document>'.length)

  return messages.map((m, i) =>
    i === sysIdx ? { ...m, content: newSys } : m,
  )
}

/** Cache of loaded engines, keyed by model id. */
const engineCache = new Map<string, Promise<MlcEngine>>()

function hasWebGpu(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { gpu?: unknown }).gpu !== 'undefined'
  )
}

async function loadModule(): Promise<MlcModule> {
  // String-literal dynamic import so Webpack/Turbopack emits a separate
  // chunk and nothing from web-llm touches the main bundle. `@mlc-ai/web-llm`
  // is a regular dependency, so the import resolves at build time; the
  // runtime guard below is just belt-and-suspenders in case a future build
  // ever externalises or stubs the package.
  const mod = (await import('@mlc-ai/web-llm')) as unknown as MlcModule
  if (typeof mod?.CreateMLCEngine !== 'function') {
    throw new Error(
      '@mlc-ai/web-llm failed to load. Reinstall with: pnpm add @mlc-ai/web-llm',
    )
  }
  return mod
}

function emitProgress(p: MlcInitProgress): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent('ink:webllm-progress', { detail: p }),
    )
  } catch {
    /* swallow */
  }
}

async function getEngine(modelId: string): Promise<MlcEngine> {
  const cached = engineCache.get(modelId)
  if (cached) return cached
  const p = (async () => {
    const mod = await loadModule()
    return mod.CreateMLCEngine(modelId, {
      initProgressCallback: emitProgress,
      // Most quantised models support at least 8 k tokens; set this so
      // the engine doesn't cap at the conservative 4 096 default and
      // immediately overflow on the first request that includes document
      // context. The model hard-caps at its own architectural maximum, so
      // setting this higher than the model supports is harmless.
      chatOpts: { context_window_size: 8192 },
    })
  })()
  engineCache.set(modelId, p)
  try {
    return await p
  } catch (err) {
    // Don't poison the cache on failure — let the next call retry.
    engineCache.delete(modelId)
    throw err
  }
}

async function* streamWebLlm(
  req: ChatCompletionRequest,
): AsyncGenerator<ChatStreamChunk> {
  if (!hasWebGpu()) {
    yield {
      type: 'error',
      message:
        'WebGPU is required for WebLLM. Try Chrome, Edge, or a recent Chromium build.',
    }
    return
  }

  const modelId = req.model || DEFAULT_WEBLLM_MODEL

  let engine: MlcEngine
  try {
    engine = await getEngine(modelId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    yield {
      type: 'error',
      message: `WebLLM model load failed (${modelId}): ${msg}`,
    }
    return
  }

  // Wire cancellation. WebLLM supports `interruptGenerate` but doesn't
  // honour AbortSignal directly.
  const onAbort = () => {
    try {
      engine.interruptGenerate?.()
    } catch {
      /* swallow */
    }
  }
  req.signal?.addEventListener('abort', onAbort, { once: true })

  let stream: AsyncIterable<MlcChatDelta>
  try {
    stream = await engine.chat.completions.create({
      messages: fitToContextWindow(req.messages),
      stream: true,
    })
  } catch (err) {
    if (req.signal?.aborted) {
      yield { type: 'error', message: 'Cancelled' }
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    yield { type: 'error', message: `WebLLM stream init failed: ${msg}` }
    return
  }

  try {
    for await (const chunk of stream) {
      if (req.signal?.aborted) {
        yield { type: 'error', message: 'Cancelled' }
        return
      }
      const delta = chunk.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta.length > 0) {
        yield { type: 'delta', content: delta }
      }
    }
    yield { type: 'done' }
  } catch (err) {
    if (req.signal?.aborted) {
      yield { type: 'error', message: 'Cancelled' }
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    yield { type: 'error', message: `WebLLM stream error: ${msg}` }
  } finally {
    req.signal?.removeEventListener('abort', onAbort)
  }
}

export const webllmProvider: ChatProvider = {
  id: 'webllm',
  label: 'WebLLM (WebGPU, in-browser)',
  defaultBaseUrl: '',
  streamChat: streamWebLlm,
}