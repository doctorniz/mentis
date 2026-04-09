'use client'

import { useEffect, useState } from 'react'
import type { FileSystemAdapter } from '@/lib/fs'
import { assetToBlobUrl, isImagePath } from '@/lib/notes/assets'
import { cn } from '@/utils/cn'

/**
 * Renders a vault-relative image path by loading the file from the FS
 * adapter and creating a blob URL. Falls back to showing the path as
 * alt text if loading fails.
 */
export function VaultImageView({
  src,
  alt,
  vaultFs,
  imgClassName,
}: {
  src: string
  alt?: string | null
  vaultFs: FileSystemAdapter
  /** Merged with default inline styles (e.g. centred preview: object-contain, max height). */
  imgClassName?: string
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!src) return
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      setBlobUrl(src)
      return
    }
    if (!isImagePath(src)) {
      setError(true)
      return
    }
    let revoked = false
    let url: string | null = null
    void assetToBlobUrl(vaultFs, src)
      .then((u) => {
        if (revoked) {
          URL.revokeObjectURL(u)
          return
        }
        url = u
        setBlobUrl(u)
      })
      .catch(() => setError(true))

    return () => {
      revoked = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [src, vaultFs])

  if (error || !blobUrl) {
    return (
      <span
        className={cn(
          'border-border bg-bg-hover text-fg-muted inline-flex items-center gap-1 rounded border px-2 py-1 text-xs',
          error && 'text-danger',
        )}
      >
        {error ? `⚠ Could not load: ${src}` : `Loading ${src}…`}
      </span>
    )
  }

  return (
    <img
      src={blobUrl}
      alt={alt ?? ''}
      className={cn('my-2 max-w-full rounded', imgClassName)}
      draggable={false}
    />
  )
}
