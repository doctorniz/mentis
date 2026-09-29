import type { SlidesRender } from './slides-render'
import type { SlidesRequest, SlidesResponse } from './slides-protocol'

/**
 * Main-thread handle on the slide render worker. It starts on the first render
 * (never at import) and stops after a quiet spell. Only the newest source is
 * kept waiting: a render superseded before it started, or while it ran,
 * resolves `null` and the caller drops it.
 */

export interface SlidesWorkerLike {
  onmessage: ((event: MessageEvent<SlidesResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: SlidesRequest): void
  terminate(): void
}

interface Job {
  id: number
  source: string
  resolve: (v: SlidesRender | null) => void
  reject: (e: Error) => void
}

const IDLE_MS = 30_000

export function createSlidesRenderer(spawn: () => SlidesWorkerLike, idleMs = IDLE_MS) {
  let worker: SlidesWorkerLike | null = null
  let nextId = 1
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Job | null = null
  let waiting: Job | null = null

  function stop() {
    clearTimeout(idleTimer)
    worker?.terminate()
    worker = null
  }

  function failAll(error: Error) {
    inFlight?.reject(error)
    waiting?.reject(error)
    inFlight = null
    waiting = null
    stop()
  }

  function send(job: Job) {
    inFlight = job
    worker!.postMessage({ id: job.id, source: job.source })
  }

  function getWorker(): SlidesWorkerLike {
    if (worker) return worker
    const w = spawn()
    w.onmessage = (event) => {
      const res = event.data
      const job = inFlight
      if (!job || job.id !== res.id) return
      inFlight = null
      // A newer source is already waiting, so this result is out of date.
      if (waiting) job.resolve(null)
      else if (res.ok) job.resolve(res.result)
      else job.reject(new Error(res.error))
      if (waiting) {
        const next = waiting
        waiting = null
        send(next)
      } else {
        idleTimer = setTimeout(stop, idleMs)
      }
    }
    w.onerror = (event) => {
      event.preventDefault?.()
      failAll(new Error(event.message || 'Slide render worker failed'))
    }
    worker = w
    return w
  }

  function render(source: string): Promise<SlidesRender | null> {
    getWorker()
    clearTimeout(idleTimer)
    return new Promise((resolve, reject) => {
      const job: Job = { id: nextId++, source, resolve, reject }
      if (!inFlight) {
        send(job)
        return
      }
      waiting?.resolve(null)
      waiting = job
    })
  }

  return { render, stop }
}

let shared: ReturnType<typeof createSlidesRenderer> | null = null

/** Render a deck off the main thread. Resolves `null` if a newer render replaced it. */
export function renderSlidesInWorker(source: string): Promise<SlidesRender | null> {
  if (!shared) {
    shared = createSlidesRenderer(
      () =>
        new Worker(new URL('./slides-worker.ts', import.meta.url), {
          type: 'module',
          name: 'mentis-slides',
        }) as unknown as SlidesWorkerLike,
    )
    window.addEventListener('pagehide', () => shared?.stop(), { once: true })
  }
  return shared.render(source)
}
