/**
 * Audio recorder — captures microphone input and encodes to MP3 via lamejs.
 *
 * Flow:
 *   getUserMedia → MediaStreamSource → ScriptProcessorNode → PCM float32 buffer
 *   on stop → PCM → Int16 → lamejs Mp3Encoder → Uint8Array (.mp3 bytes)
 *
 * We use ScriptProcessorNode (deprecated but universally supported) instead of
 * AudioWorklet because lamejs runs on the main thread anyway, and AudioWorklet
 * would require a separate module script + message passing overhead.
 */

// lamejs ships as a UMD bundle with no default export — dynamic import handles this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lameModule: any = null

async function getLame() {
  if (!lameModule) {
    if (typeof window === 'undefined') throw new Error('lamejs requires a browser environment')
    // lamejs default export is the module namespace
    const mod = await import('lamejs')
    lameModule = mod.default ?? mod
  }
  return lameModule
}

export interface RecorderState {
  status: 'idle' | 'recording' | 'paused' | 'stopped'
  elapsedMs: number
  /** RMS audio level 0–1 for visualization. */
  level: number
}

export interface AudioRecorderOptions {
  /** Sample rate for recording. Defaults to device native rate. */
  sampleRate?: number
  /** MP3 bitrate in kbps. Default 128. */
  bitrate?: number
  /** Callback fired ~60fps with updated state. */
  onStateChange?: (state: RecorderState) => void
}

export class AudioRecorder {
  private stream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processor: any = null
  private pcmChunks: Float32Array[] = []
  private _state: RecorderState = { status: 'idle', elapsedMs: 0, level: 0 }
  private startTime = 0
  private pauseOffset = 0
  private rafId = 0
  private analyser: AnalyserNode | null = null
  private analyserData: Uint8Array<ArrayBuffer> | null = null
  private opts: Required<AudioRecorderOptions>

  constructor(opts: AudioRecorderOptions = {}) {
    this.opts = {
      sampleRate: opts.sampleRate ?? 0, // 0 = use device native
      bitrate: opts.bitrate ?? 128,
      onStateChange: opts.onStateChange ?? (() => {}),
    }
  }

  get state(): RecorderState {
    return { ...this._state }
  }

  /** Request mic permission and start recording. */
  async start(): Promise<void> {
    if (this._state.status === 'recording') return

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    const sampleRate = this.opts.sampleRate || this.stream.getAudioTracks()[0]?.getSettings().sampleRate || 44100
    this.audioCtx = new AudioContext({ sampleRate })
    this.source = this.audioCtx.createMediaStreamSource(this.stream)

    // Analyser for level metering
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 256
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
    this.source.connect(this.analyser)

    // ScriptProcessor for PCM capture
    const bufSize = 4096
    this.processor = this.audioCtx.createScriptProcessor(bufSize, 1, 1)
    this.pcmChunks = []

    this.processor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (this._state.status !== 'recording') return
      const input = e.inputBuffer.getChannelData(0)
      this.pcmChunks.push(new Float32Array(input))
    }

    this.source.connect(this.processor)
    this.processor.connect(this.audioCtx.destination)

    this.startTime = performance.now()
    this.pauseOffset = 0
    this.updateState('recording')
    this.tick()
  }

  /** Pause recording. */
  pause(): void {
    if (this._state.status !== 'recording') return
    this.pauseOffset = this._state.elapsedMs
    cancelAnimationFrame(this.rafId)
    this.updateState('paused')
  }

  /** Resume from pause. */
  resume(): void {
    if (this._state.status !== 'paused') return
    this.startTime = performance.now()
    this.updateState('recording')
    this.tick()
  }

  /** Stop recording and return MP3 bytes. */
  async stop(): Promise<{ mp3Bytes: Uint8Array; durationMs: number }> {
    cancelAnimationFrame(this.rafId)
    const elapsed = this._state.elapsedMs

    // Disconnect audio graph
    try { this.processor?.disconnect() } catch { /* */ }
    try { this.source?.disconnect() } catch { /* */ }
    this.stream?.getTracks().forEach((t) => t.stop())

    const sampleRate = this.audioCtx?.sampleRate ?? 44100
    await this.audioCtx?.close().catch(() => {})

    this.updateState('stopped')

    // Concatenate PCM chunks
    const totalSamples = this.pcmChunks.reduce((n, c) => n + c.length, 0)
    const pcm = new Float32Array(totalSamples)
    let offset = 0
    for (const chunk of this.pcmChunks) {
      pcm.set(chunk, offset)
      offset += chunk.length
    }
    this.pcmChunks = []

    // Encode to MP3
    const mp3Bytes = await encodeMp3(pcm, sampleRate, this.opts.bitrate)

    // Cleanup refs
    this.stream = null
    this.audioCtx = null
    this.source = null
    this.processor = null
    this.analyser = null
    this.analyserData = null

    return { mp3Bytes, durationMs: elapsed }
  }

  /** Cancel recording without producing output. */
  cancel(): void {
    cancelAnimationFrame(this.rafId)
    try { this.processor?.disconnect() } catch { /* */ }
    try { this.source?.disconnect() } catch { /* */ }
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.audioCtx?.close().catch(() => {})
    this.pcmChunks = []
    this.stream = null
    this.audioCtx = null
    this.source = null
    this.processor = null
    this.analyser = null
    this.analyserData = null
    this.updateState('idle')
  }

  private tick = () => {
    if (this._state.status !== 'recording') return
    const now = performance.now()
    const elapsed = this.pauseOffset + (now - this.startTime)

    // Compute RMS level from analyser
    let level = 0
    if (this.analyser && this.analyserData) {
      this.analyser.getByteTimeDomainData(this.analyserData)
      let sum = 0
      for (let i = 0; i < this.analyserData.length; i++) {
        const v = (this.analyserData[i] - 128) / 128
        sum += v * v
      }
      level = Math.sqrt(sum / this.analyserData.length)
    }

    this._state = { status: 'recording', elapsedMs: elapsed, level }
    this.opts.onStateChange(this._state)
    this.rafId = requestAnimationFrame(this.tick)
  }

  private updateState(status: RecorderState['status']) {
    this._state = { ...this._state, status }
    this.opts.onStateChange(this._state)
  }
}

/** Encode float32 PCM to MP3 bytes via lamejs. */
async function encodeMp3(
  pcm: Float32Array,
  sampleRate: number,
  kbps: number,
): Promise<Uint8Array> {
  const lame = await getLame()
  const encoder = new lame.Mp3Encoder(1, sampleRate, kbps)

  // Convert float32 → int16
  const samples = new Int16Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }

  const mp3Parts: Int8Array[] = []
  const blockSize = 1152
  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk = samples.subarray(i, i + blockSize)
    const encoded = encoder.encodeBuffer(chunk)
    if (encoded.length > 0) mp3Parts.push(encoded)
  }

  const flush = encoder.flush()
  if (flush.length > 0) mp3Parts.push(flush)

  // Concatenate
  const totalLen = mp3Parts.reduce((n, p) => n + p.length, 0)
  const result = new Uint8Array(totalLen)
  let off = 0
  for (const part of mp3Parts) {
    result.set(part, off)
    off += part.length
  }
  return result
}
