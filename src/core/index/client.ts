import type { IndexOp, IndexOps, IndexRequest, IndexResponse } from './protocol'

/**
 * Main-thread handle on the index worker. The worker (and SQLite with it) is
 * started on the first request, never at import, so nothing loads until a
 * vault is open.
 */

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'mentis-index',
  })
  worker.onmessage = (event: MessageEvent<IndexResponse>) => {
    const res = event.data
    const entry = pending.get(res.id)
    if (!entry) return
    pending.delete(res.id)
    if (res.ok) entry.resolve(res.result)
    else entry.reject(new Error(res.error))
  }
  worker.onerror = (event) => {
    event.preventDefault()
    const error = new Error(event.message || 'Index worker failed')
    for (const entry of pending.values()) entry.reject(error)
    pending.clear()
    worker?.terminate()
    worker = null
  }
  // Release the database promptly on reload/close so the next page can take
  // it over instead of falling back to an in-memory index.
  window.addEventListener(
    'pagehide',
    () => {
      worker?.terminate()
      worker = null
    },
    { once: true },
  )
  return worker
}

export function callIndex<K extends IndexOp>(op: K, arg: IndexOps[K][0]): Promise<IndexOps[K][1]> {
  const w = getWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    const request: IndexRequest<K> = { id, op, arg }
    w.postMessage(request)
  })
}

/** True once a request has started the worker (so closing has something to do). */
export function indexWorkerStarted(): boolean {
  return worker !== null
}
