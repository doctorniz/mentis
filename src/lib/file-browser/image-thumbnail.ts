import type { FileSystemAdapter } from '@/lib/fs'

const thumbCache = new Map<string, string>()

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
}

/** Read an image file and return a blob-URL thumbnail. Cached by path. */
export async function getImageThumbnail(
  vaultFs: FileSystemAdapter,
  path: string,
): Promise<string | null> {
  if (thumbCache.has(path)) return thumbCache.get(path)!
  try {
    const data = await vaultFs.readFile(path)
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME_MAP[ext] ?? 'application/octet-stream'
    // Cast required because `vaultFs.readFile` returns a Uint8Array with an
    // `ArrayBufferLike` backing buffer, which strict lib.dom rejects as a
    // `BlobPart` (its union includes SharedArrayBuffer). The bytes here are
    // always plain ArrayBuffer. Same pattern as canvas-file-io.ts.
    const blob = new Blob([data as BlobPart], { type: mime })
    const url = URL.createObjectURL(blob)
    thumbCache.set(path, url)
    return url
  } catch {
    return null
  }
}

export function evictImageThumbnail(path: string): void {
  const url = thumbCache.get(path)
  if (url) {
    URL.revokeObjectURL(url)
    thumbCache.delete(path)
  }
}

export function clearImageThumbnailCache(): void {
  for (const url of thumbCache.values()) URL.revokeObjectURL(url)
  thumbCache.clear()
}
