import type { SearchExtraction } from '@/core/registries/file-types'
import type { ExtractRequest } from './extract'
import type { ExtractMessage, ExtractResponse } from './extract-protocol'

/**
 * Main-thread handle on the extract worker. It starts on the first request
 * (never at import) and stops after a quiet spell, so an idle vault holds no
 * parser memory.
 */

const IDLE_MS = 30_000

interface Pending {
  resolve: (v: SearchExtraction | null) => void
  reject: (e: Error) => void
}

let worker: Worker | null = null
let nextId = 1
let idleTimer: ReturnType<typeof setTimeout> | undefined
const pending = new Map<number, Pending>()

function stop() {
  clearTimeout(idleTimer)
  worker?.terminate()
  worker = null
}

function failAll(error: Error) {
  for (const entry of pending.values()) entry.reject(error)
  pending.clear()
  stop()
}

function armIdleTimer() {
  clearTimeout(idleTimer)
  if (pending.size === 0) idleTimer = setTimeout(stop, IDLE_MS)
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./extract-worker.ts', import.meta.url), {
    type: 'module',
    name: 'mentis-extract',
  })
  worker.onmessage = (event: MessageEvent<ExtractResponse>) => {
    const res = event.data
    const entry = pending.get(res.id)
    if (!entry) return
    pending.delete(res.id)
    if (res.ok) entry.resolve(res.result)
    else entry.reject(new Error(res.error))
    armIdleTimer()
  }
  worker.onerror = (event) => {
    event.preventDefault()
    failAll(new Error(event.message || 'Extract worker failed'))
  }
  window.addEventListener('pagehide', stop, { once: true })
  return worker
}

export function extractInWorker(request: ExtractRequest): Promise<SearchExtraction | null> {
  const w = getWorker()
  clearTimeout(idleTimer)
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const message: ExtractMessage = { id, request }
    const { data } = request
    // Hand the bytes over rather than copying them, unless they are a view
    // onto a larger buffer the caller may still need.
    const transfer =
      typeof data !== 'string' &&
      data.byteOffset === 0 &&
      data.byteLength === data.buffer.byteLength
        ? [data.buffer]
        : []
    w.postMessage(message, transfer)
  })
}
