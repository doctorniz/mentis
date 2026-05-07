/**
 * Speech-to-text transcription via Whisper-tiny.en (ONNX) in the browser
 * through @huggingface/transformers (ONNX runtime).
 *
 * Uses WebGPU where available (Chrome 113+) for GPU-accelerated inference,
 * falling back to WASM. The model (~40MB quantized) is downloaded once and
 * cached by the browser (HF hub: Xenova ONNX exports; public, no token).
 *
 * Progress events are emitted via `ink:whisper-progress` CustomEvent so the
 * UI can show a download bar on first use.
 *
 * Usage:
 *   const text = await transcribeAudio(mp3Bytes)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelineInstance: any = null
let loading = false
let loadPromise: Promise<void> | null = null

/** Public ONNX checkpoint; `onnx-community/distil-whisper-small.en` returns 401 without HF auth in-browser. */
const MODEL_ID = 'Xenova/whisper-tiny.en'

/** Prefer WebGPU; fall back to WASM for browsers without it. */
async function resolveDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      const adapter = await (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter()
      if (adapter) return 'webgpu'
    }
  } catch { /* ignore */ }
  return 'wasm'
}

/**
 * Lazily load the pipeline. Caches after first load.
 * Fires `ink:whisper-progress` CustomEvents during model download.
 */
async function getPipeline() {
  if (pipelineInstance) return pipelineInstance

  if (loading && loadPromise) {
    await loadPromise
    return pipelineInstance
  }

  loading = true
  loadPromise = (async () => {
    try {
      const [{ pipeline }, device] = await Promise.all([
        import('@huggingface/transformers'),
        resolveDevice(),
      ])

      pipelineInstance = await pipeline(
        'automatic-speech-recognition',
        MODEL_ID,
        {
          dtype: device === 'webgpu' ? 'fp16' : 'q8',
          device,
          progress_callback: (progress: { status: string; progress?: number; file?: string }) => {
            window.dispatchEvent(
              new CustomEvent('ink:whisper-progress', { detail: progress }),
            )
          },
        },
      )
    } finally {
      loading = false
    }
  })()

  await loadPromise
  return pipelineInstance
}

/**
 * Decode MP3/audio bytes into a Float32Array of mono 16kHz PCM samples
 * suitable for Whisper input.
 */
async function decodeAudioToFloat32(audioBytes: Uint8Array): Promise<Float32Array> {
  const audioCtx = new AudioContext({ sampleRate: 16000 })
  try {
    const arrayBuffer = audioBytes.buffer.slice(
      audioBytes.byteOffset,
      audioBytes.byteOffset + audioBytes.byteLength,
    ) as ArrayBuffer
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

    // Mix down to mono
    const mono = new Float32Array(audioBuffer.length)
    const channels = audioBuffer.numberOfChannels
    for (let ch = 0; ch < channels; ch++) {
      const data = audioBuffer.getChannelData(ch)
      for (let i = 0; i < data.length; i++) {
        mono[i] += data[i] / channels
      }
    }
    return mono
  } finally {
    await audioCtx.close()
  }
}

export interface TranscribeResult {
  text: string
}

/**
 * A threshold (in seconds) between Whisper chunks above which a new
 * paragraph is started. Pauses shorter than this are kept as a single
 * space; longer pauses suggest a topic/thought boundary.
 */
const PARAGRAPH_GAP_S = 1.5

interface WhisperChunk {
  text: string
  timestamp: [number, number | null]
}

/**
 * Join Whisper chunks into paragraphed text.
 * A gap ≥ PARAGRAPH_GAP_S between the end of one chunk and the start of
 * the next is treated as a paragraph break; shorter gaps are joined with
 * a space.
 */
function chunksToText(chunks: WhisperChunk[]): string {
  if (!chunks.length) return ''

  const paragraphs: string[] = []
  let current = chunks[0].text.trim()

  for (let i = 1; i < chunks.length; i++) {
    const prevEnd = chunks[i - 1].timestamp[1]
    const nextStart = chunks[i].timestamp[0]
    const gap = prevEnd != null ? nextStart - prevEnd : 0

    if (gap >= PARAGRAPH_GAP_S) {
      if (current) paragraphs.push(current)
      current = chunks[i].text.trim()
    } else {
      current += ' ' + chunks[i].text.trim()
    }
  }

  if (current) paragraphs.push(current)
  return paragraphs.join('\n\n')
}

/**
 * Transcribe audio bytes to text using Whisper-tiny.en (WebGPU or WASM).
 * First call downloads the model (~40MB); subsequent calls use the cached pipeline.
 * Pauses ≥ 1.5 s between chunks produce paragraph breaks.
 */
export async function transcribeAudio(
  audioBytes: Uint8Array,
): Promise<TranscribeResult> {
  const transcriber = await getPipeline()
  const pcm = await decodeAudioToFloat32(audioBytes)

  const result = await transcriber(pcm, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  })

  // With return_timestamps: true the pipeline returns { text, chunks[] }.
  // Fall back to plain text if the shape is unexpected (e.g. very short clips).
  const raw = result as { text?: string; chunks?: WhisperChunk[] }

  if (raw.chunks && raw.chunks.length > 0) {
    return { text: chunksToText(raw.chunks) }
  }

  const text = typeof result === 'string' ? result : (raw.text ?? '')
  return { text: text.trim() }
}

/**
 * Check if Whisper model is already cached (pipeline loaded).
 */
export function isWhisperLoaded(): boolean {
  return pipelineInstance !== null
}

/**
 * Check if Whisper is currently loading.
 */
export function isWhisperLoading(): boolean {
  return loading
}
