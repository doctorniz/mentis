'use client'

import { useEffect, useState } from 'react'
import { Mic } from 'lucide-react'

import type { FileSystemAdapter } from '@/lib/fs'
import { assetToBlobUrl } from '@/lib/notes/assets'
import { AudioPlayer } from '@/components/audio/audio-player'

/**
 * Renders a vault audio file with playback controls.
 * Reads the file from the FS adapter, creates a blob URL, and revokes
 * it on unmount to avoid memory leaks.
 */
export function AudioPlayerView({
  vaultFs,
  path,
  title,
}: {
  vaultFs: FileSystemAdapter
  path: string
  title: string
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let revoked = false
    let url: string | null = null

    void assetToBlobUrl(vaultFs, path)
      .then((u) => {
        if (revoked) {
          URL.revokeObjectURL(u)
          return
        }
        url = u
        setBlobUrl(u)
      })
      .catch((err) => {
        console.error('Failed to load audio:', path, err)
        setError(`Could not load audio: ${path}`)
      })

    return () => {
      revoked = true
      if (url) URL.revokeObjectURL(url)
      setBlobUrl(null)
    }
  }, [vaultFs, path])

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-danger text-sm">{error}</p>
      </div>
    )
  }

  if (!blobUrl) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-fg-muted text-sm">Loading {title}…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-auto p-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-accent/10">
            <Mic className="size-8 text-accent" />
          </div>
          <h2 className="text-fg text-lg font-semibold">{title}</h2>
        </div>
        <AudioPlayer src={blobUrl} />
      </div>
    </div>
  )
}
