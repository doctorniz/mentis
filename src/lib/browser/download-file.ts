/**
 * Trigger a one-click file download in the browser (no navigation).
 */
export function downloadTextFile(filename: string, text: string, mimeType = 'text/plain;charset=utf-8') {
  const safeName = sanitizeDownloadFilename(filename)
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function sanitizeDownloadFilename(name: string): string {
  const base = name.replace(/[/\\:*?"<>|]/g, '_').trim()
  return base.length > 0 ? base : 'download'
}
