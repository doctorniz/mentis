import { DEVICE_CHAT_MODEL } from '@/types/chat'

export const DEVICE_MODEL_ID = DEVICE_CHAT_MODEL
/** See https://huggingface.co/huggingworld/gemma-4-E2B-it-litert-lm/tree/main — web artifact name is `gemma-4-E2B-it-web.task`. */
export const DEVICE_MODEL_URL =
  'https://huggingface.co/huggingworld/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task'
const DEVICE_MODEL_DIR = 'ink-marrow-models'
const DEVICE_MODEL_FILE = 'gemma-4-e2b.task'

export const DEVICE_MODEL_PROGRESS_EVENT = 'ink:device-model-progress'

export type DeviceModelStatus = 'missing' | 'ready'

function emitProgress(progress: number, text: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(DEVICE_MODEL_PROGRESS_EVENT, {
      detail: { progress, text },
    }),
  )
}

async function getModelFileHandle(create: boolean): Promise<FileSystemFileHandle> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error('OPFS is not available in this browser.')
  }
  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(DEVICE_MODEL_DIR, { create })
  return dir.getFileHandle(DEVICE_MODEL_FILE, { create })
}

async function readCachedModelBytes(): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const handle = await getModelFileHandle(false)
    const file = await handle.getFile()
    const buf = await file.arrayBuffer()
    return new Uint8Array(buf) as Uint8Array<ArrayBuffer>
  } catch {
    return null
  }
}

async function downloadModelBytes(): Promise<Uint8Array<ArrayBuffer>> {
  emitProgress(0, 'Downloading model…')
  const res = await fetch(DEVICE_MODEL_URL)
  if (!res.ok || !res.body) {
    throw new Error(`Model download failed (${res.status}).`)
  }

  const total = Number(res.headers.get('content-length') ?? 0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    loaded += value.byteLength
    if (total > 0) {
      emitProgress(Math.min(1, loaded / total), 'Downloading model…')
    }
  }

  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }

  const handle = await getModelFileHandle(true)
  const writable = await handle.createWritable()
  await writable.write(out)
  await writable.close()

  emitProgress(1, 'Model ready')
  return out as Uint8Array<ArrayBuffer>
}

export async function getDeviceModelStatus(): Promise<DeviceModelStatus> {
  const bytes = await readCachedModelBytes()
  return bytes ? 'ready' : 'missing'
}

export async function ensureDeviceModelDownloaded(): Promise<void> {
  const cached = await readCachedModelBytes()
  if (cached) {
    emitProgress(1, 'Model ready')
    return
  }
  await downloadModelBytes()
}

export async function loadDeviceModelBytes(): Promise<Uint8Array<ArrayBuffer>> {
  const cached = await readCachedModelBytes()
  if (cached) {
    emitProgress(1, 'Model ready')
    return cached
  }
  return downloadModelBytes()
}
