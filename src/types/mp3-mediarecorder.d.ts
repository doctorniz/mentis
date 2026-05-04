// mp3-mediarecorder ships its own types (dist/index.d.ts), but we alias
// the module to `false` on the server for prerendering. This ambient
// declaration prevents TS from complaining when the alias resolves to a
// boolean. The actual types from the package take precedence at runtime.
declare module 'mp3-mediarecorder' {
  export class Mp3MediaRecorder extends EventTarget {
    constructor(
      stream: MediaStream,
      options?: { worker?: Worker },
    )
    readonly state: 'inactive' | 'recording' | 'paused'
    start(timeslice?: number): void
    stop(): void
    pause(): void
    resume(): void
    ondataavailable: ((event: BlobEvent) => void) | null
    onstop: (() => void) | null
    onerror: ((event: Event) => void) | null
    onstart: (() => void) | null
    onpause: (() => void) | null
    onresume: (() => void) | null
  }
}
