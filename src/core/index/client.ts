import { isTauri } from '@/lib/fs/platform'
import type { IndexOp, IndexOps } from './protocol'

/**
 * The window's handle on the index. In the desktop app the index is SQLite in
 * the shell, reached through one `index_call` command; in a browser it is
 * sqlite-wasm in a worker. Either backend loads on the first request, never at
 * import, so nothing loads until a vault is open.
 */

let used = false
let tail: Promise<unknown> = Promise.resolve()

const native = () => __MENTIS_DESKTOP__ || isTauri()

// Requests reach the shell one at a time, in the order they were made: the
// index state (the open vault, writes after a close) depends on that order.
function callNative<K extends IndexOp>(op: K, arg: IndexOps[K][0]): Promise<IndexOps[K][1]> {
  const run = tail.then(async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    return (await invoke('index_call', { op, arg })) as IndexOps[K][1]
  })
  tail = run.catch(() => {})
  return run
}

type WorkerClient = typeof import('./worker-client')
let web: Promise<WorkerClient> | null = null
let webLoaded: WorkerClient | null = null

function loadWeb(): Promise<WorkerClient> {
  // A constant condition, so desktop builds drop the worker (and sqlite-wasm).
  web ??= __MENTIS_DESKTOP__
    ? Promise.reject(new Error('The browser index is not part of the desktop build'))
    : import('./worker-client').then((m) => (webLoaded = m))
  return web
}

export function callIndex<K extends IndexOp>(op: K, arg: IndexOps[K][0]): Promise<IndexOps[K][1]> {
  used = true
  if (native()) return callNative(op, arg)
  return loadWeb().then((m) => m.callWorker(op, arg))
}

/** True once a request has started the index (so closing has something to do). */
export function indexWorkerStarted(): boolean {
  return native() ? used : (webLoaded?.workerStarted() ?? false)
}
