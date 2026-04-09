import type { FileSystemAdapter } from '@/lib/fs'
import { loadPdfjs } from '@/lib/pdf/pdfjs-loader'

const thumbCache = new Map<string, string>()

const THUMB_WIDTH = 200

/** Render page 1 of a PDF to a blob-URL thumbnail. Cached by path. */
export async function getPdfThumbnail(
  vaultFs: FileSystemAdapter,
  path: string,
): Promise<string | null> {
  if (thumbCache.has(path)) return thumbCache.get(path)!
  try {
    const pdfjs = await loadPdfjs()
    const data = await vaultFs.readFile(path)
    const doc = await pdfjs.getDocument({ data }).promise
    const page = await doc.getPage(1)
    const vp = page.getViewport({ scale: 1 })
    const scale = THUMB_WIDTH / vp.width
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), 'image/png'),
    )
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    thumbCache.set(path, url)
    return url
  } catch {
    return null
  }
}

export function evictThumbnail(path: string): void {
  const url = thumbCache.get(path)
  if (url) {
    URL.revokeObjectURL(url)
    thumbCache.delete(path)
  }
}

export function clearThumbnailCache(): void {
  for (const url of thumbCache.values()) URL.revokeObjectURL(url)
  thumbCache.clear()
}
