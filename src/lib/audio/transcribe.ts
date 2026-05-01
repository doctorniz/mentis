/**
 * Speech-to-text transcription via Whisper-tiny running in the browser
 * through @huggingface/transformers (ONNX runtime / WebGPU / WASM).
 *
 * The model (~40MB quantized) is downloaded once and cached by the browser.
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

const MODEL_ID = 'onnx-community/whisper-tiny.en'

/**
 * Lazily load the Whisper-tiny pipeline. Caches after first load.
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
      const { pipeline } = await import('@huggingface/transformers')

      pipelineInstance = await pipeline(
        'automatic-speech-recognition',
        MODEL_ID,
        {
          dtype: 'q8',
          device: 'wasm',
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
 * Transcribe audio bytes (MP3, WAV, etc.) to text using Whisper-tiny.
 *
 * First call will download the model (~40MB). Subsequent calls use the
 * cached pipeline.
 *
 * @param audioBytes Raw audio file bytes (MP3, WAV, etc.)
 * @returns Transcribed text
 */
export async function transcribeAudio(
  audioBytes: Uint8Array,
): Promise<TranscribeResult> {
  const transcriber = await getPipeline()
  const pcm = await decodeAudioToFloat32(audioBytes)

  const result = await transcriber(pcm, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  })

  const text = typeof result === 'string'
    ? result
    : (result as { text: string }).text ?? ''

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
