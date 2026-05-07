import {
  DEVICE_MODEL_ID,
  loadDeviceModelBytes,
} from '@/lib/chat/device-model-store'
import type {
  ChatCompletionRequest,
  ChatProvider,
  ChatStreamChunk,
  WireMessage,
} from './types'

/**
 * MediaPipe defaults `maxTokens` to 512 (input + output combined). Override here
 * so document/vault chat fits. If you see GPU OOM or init errors, lower this.
 */
const DEVICE_MAX_TOKENS = 4096

/** Reserve tokens for the assistant; trim prompt to the rest (≈3 chars / token). */
const DEVICE_OUTPUT_RESERVE_TOKENS = 800
const DEFAULT_PROMPT_CHARS = Math.max(
  1500,
  (DEVICE_MAX_TOKENS - DEVICE_OUTPUT_RESERVE_TOKENS) * 3,
)
const MIN_CONTEXT_CHARS = 1000

interface LlmInference {
  generateResponse: (
    prompt: string,
    callback?: (partial: string, done: boolean) => void,
  ) => Promise<string>
}

interface FilesetResolverApi {
  forGenAiTasks: (wasmPath: string) => Promise<unknown>
}

interface LlmInferenceApi {
  createFromOptions: (
    fileset: unknown,
    opts: {
      baseOptions: { modelAssetBuffer: Uint8Array<ArrayBuffer> }
      maxTokens?: number
      topK?: number
      temperature?: number
    },
  ) => Promise<LlmInference>
}

interface MediaPipeGenAiModule {
  FilesetResolver: FilesetResolverApi
  LlmInference: LlmInferenceApi
}

let inferencePromise: Promise<LlmInference> | null = null

function hasWebGpu(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { gpu?: unknown }).gpu !== 'undefined'
  )
}

/**
 * Gemma IT is trained with only `user` and `model` turns — no separate
 * `system` role. A lone system block as `<start_of_turn>user>` before the real
 * user question yields two back-to-back user turns and breaks generation (echoed
 * `user>` lines, garbled output). Merge system text into the first real user
 * turn instead. See https://ai.google.dev/gemma/docs/core/prompt-structure
 */
function mergeSystemIntoFirstUser(messages: WireMessage[]): WireMessage[] {
  const systemParts: string[] = []
  const rest: WireMessage[] = []
  for (const m of messages) {
    if (m.role === 'system') systemParts.push(m.content)
    else rest.push(m)
  }
  if (systemParts.length === 0) return rest
  const prefix = systemParts.join('\n\n').trim()
  if (rest.length === 0) {
    return [{ role: 'user', content: prefix }]
  }
  if (rest[0].role === 'user') {
    const body = rest[0].content
    const merged =
      prefix.length > 0 ? `${prefix}\n\n${body}` : body
    return [{ role: 'user', content: merged }, ...rest.slice(1)]
  }
  return [{ role: 'user', content: prefix }, ...rest]
}

/** Build Gemma chat string; ends with `<start_of_turn>model\n` (generation prompt). */
function formatGemmaPrompt(messages: WireMessage[]): string {
  let out = ''
  for (const m of messages) {
    if (m.role === 'user') {
      out += `<start_of_turn>user\n${m.content}<end_of_turn>\n`
    } else if (m.role === 'assistant') {
      out += `<start_of_turn>model\n${m.content}<end_of_turn>\n`
    }
    // system already merged by mergeSystemIntoFirstUser
  }
  return `${out}<start_of_turn>model\n`
}

function fitPrompt(messages: WireMessage[]): WireMessage[] {
  const totalChars = (arr: WireMessage[]) =>
    arr.reduce((n, m) => n + m.content.length, 0)

  let working = [...messages]
  while (totalChars(working) > DEFAULT_PROMPT_CHARS) {
    const firstUserIdx = working.findIndex((m, i) => i > 0 && m.role === 'user')
    const lastUserIdx = working.reduce(
      (last, m, i) => (m.role === 'user' ? i : last),
      -1,
    )
    if (firstUserIdx === -1 || firstUserIdx === lastUserIdx) break
    const dropEnd =
      firstUserIdx + 1 < working.length && working[firstUserIdx + 1].role === 'assistant'
        ? firstUserIdx + 2
        : firstUserIdx + 1
    working = [...working.slice(0, firstUserIdx), ...working.slice(dropEnd)]
  }

  if (totalChars(working) <= DEFAULT_PROMPT_CHARS) return working

  const sysIdx = working.findIndex((m) => m.role === 'system')
  if (sysIdx === -1) return working
  const sys = working[sysIdx].content
  const maxSysChars = Math.max(
    MIN_CONTEXT_CHARS,
    sys.length - (totalChars(working) - DEFAULT_PROMPT_CHARS),
  )
  working[sysIdx] = {
    ...working[sysIdx],
    content: `${sys.slice(0, maxSysChars)}\n[...context truncated for Local mode...]`,
  }
  return working
}

async function loadModule(): Promise<MediaPipeGenAiModule> {
  return (await import('@mediapipe/tasks-genai')) as unknown as MediaPipeGenAiModule
}

async function getInference(): Promise<LlmInference> {
  if (inferencePromise) return inferencePromise
  inferencePromise = (async () => {
    const mod = await loadModule()
    const fileset = await mod.FilesetResolver.forGenAiTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm',
    )
    const modelAssetBuffer = await loadDeviceModelBytes()
    return mod.LlmInference.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer },
      maxTokens: DEVICE_MAX_TOKENS,
      topK: 64,
      temperature: 0.9,
    })
  })()
  try {
    return await inferencePromise
  } catch (err) {
    inferencePromise = null
    throw err
  }
}

async function* streamDevice(
  req: ChatCompletionRequest,
): AsyncGenerator<ChatStreamChunk> {
  if (!hasWebGpu()) {
    yield {
      type: 'error',
      message: 'WebGPU is required for Local mode.',
    }
    return
  }

  let inference: LlmInference
  try {
    inference = await getInference()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    yield { type: 'error', message: `Local model load failed: ${msg}` }
    return
  }

  const fitted = mergeSystemIntoFirstUser(fitPrompt(req.messages))
  const prompt = formatGemmaPrompt(fitted)
  const queue: string[] = []
  let done = false
  let streamError: string | null = null
  let wake: (() => void) | null = null
  let seen = ''
  let aborted = false

  const onAbort = () => {
    aborted = true
    if (wake) wake()
  }
  req.signal?.addEventListener('abort', onAbort, { once: true })

  /** Partials are usually cumulative; fall back to longest-prefix delta if the stream glitches. */
  function deltaFromPartial(nextRaw: string): string {
    const next = nextRaw ?? ''
    if (next.startsWith(seen)) return next.slice(seen.length)
    let i = 0
    const n = Math.min(seen.length, next.length)
    while (i < n && seen.charCodeAt(i) === next.charCodeAt(i)) i++
    return next.slice(i)
  }

  void inference
    .generateResponse(prompt, (partial, complete) => {
      if (aborted) return
      const next = partial ?? ''
      const delta = deltaFromPartial(next)
      seen = next
      if (delta.length > 0) queue.push(delta)
      if (complete) done = true
      if (wake) wake()
    })
    .catch((err) => {
      streamError = err instanceof Error ? err.message : String(err)
      done = true
      if (wake) wake()
    })
    .finally(() => {
      done = true
      if (wake) wake()
    })

  try {
    while (!done || queue.length > 0) {
      if (aborted) {
        yield { type: 'error', message: 'Cancelled' }
        return
      }
      const next = queue.shift()
      if (next) {
        yield { type: 'delta', content: next }
        continue
      }
      await new Promise<void>((resolve) => {
        wake = resolve
      })
      wake = null
    }

    if (streamError) {
      yield { type: 'error', message: `Local stream failed: ${streamError}` }
      return
    }
    yield { type: 'done' }
  } finally {
    req.signal?.removeEventListener('abort', onAbort)
  }
}

export const deviceProvider: ChatProvider = {
  id: 'device',
  label: 'Local (Gemma 4 E2B)',
  defaultBaseUrl: '',
  streamChat: streamDevice,
}

export { DEVICE_MODEL_ID }
