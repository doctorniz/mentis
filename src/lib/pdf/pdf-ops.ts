import type { PdfOpMessage, PdfOpName, PdfOpResponse, PdfOps } from './pdf-ops-protocol'

/**
 * Main-thread handle on the PDF worker (`pdf-ops-worker.ts`). Each pdf-lib
 * operation keeps its signature; the work happens in the worker. The worker
 * starts on the first call and stops after a quiet spell. Where there is no
 * Worker (unit tests), the operations run here instead.
 */

const IDLE_MS = 30_000

interface Pending {
  resolve: (v: unknown) => void
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

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./pdf-ops-worker.ts', import.meta.url), {
    type: 'module',
    name: 'mentis-pdf',
  })
  worker.onmessage = (event: MessageEvent<PdfOpResponse>) => {
    const res = event.data
    const entry = pending.get(res.id)
    if (!entry) return
    pending.delete(res.id)
    if (res.ok) entry.resolve(res.result)
    else entry.reject(new Error(res.error))
    if (pending.size === 0) idleTimer = setTimeout(stop, IDLE_MS)
  }
  worker.onerror = (event) => {
    event.preventDefault()
    failAll(new Error(event.message || 'PDF worker failed'))
  }
  window.addEventListener('pagehide', stop, { once: true })
  return worker
}

async function runHere<K extends PdfOpName>(op: K, args: Parameters<PdfOps[K]>) {
  const [pages, writer] = await Promise.all([
    import('./page-operations'),
    import('./annotation-writer'),
  ])
  const ops = { ...pages, ...writer } as unknown as PdfOps
  return (ops[op] as (...a: unknown[]) => Promise<unknown>)(...(args as unknown[]))
}

function call<K extends PdfOpName>(op: K, ...args: Parameters<PdfOps[K]>): ReturnType<PdfOps[K]> {
  if (typeof Worker === 'undefined') return runHere(op, args) as ReturnType<PdfOps[K]>
  const w = getWorker()
  clearTimeout(idleTimer)
  const id = nextId++
  return new Promise<unknown>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    // The bytes are copied, not handed over: callers keep the originals for
    // undo and snapshots.
    const message: PdfOpMessage<K> = { id, op, args }
    w.postMessage(message)
  }) as ReturnType<PdfOps[K]>
}

export const writeAnnotationsIntoPdf: PdfOps['writeAnnotationsIntoPdf'] = (...a) =>
  call('writeAnnotationsIntoPdf', ...a)
export const insertBlankPage: PdfOps['insertBlankPage'] = (...a) => call('insertBlankPage', ...a)
export const appendBlankPage: PdfOps['appendBlankPage'] = (...a) => call('appendBlankPage', ...a)
export const deletePage: PdfOps['deletePage'] = (...a) => call('deletePage', ...a)
export const rotatePage: PdfOps['rotatePage'] = (...a) => call('rotatePage', ...a)
export const reorderPages: PdfOps['reorderPages'] = (...a) => call('reorderPages', ...a)
export const mergePages: PdfOps['mergePages'] = (...a) => call('mergePages', ...a)
export const extractPages: PdfOps['extractPages'] = (...a) => call('extractPages', ...a)
export const getFormFields: PdfOps['getFormFields'] = (...a) => call('getFormFields', ...a)
export const fillFormFields: PdfOps['fillFormFields'] = (...a) => call('fillFormFields', ...a)
