'use client'

import { useEffect, useRef, useState } from 'react'

import type { FileSystemAdapter } from '@/lib/fs'
import { assetToBlobUrl } from '@/lib/notes/assets'

// Plyr accesses `document` at module scope — static import crashes
// Next.js static-export prerendering. Dynamic import defers evaluation
// to the browser where `document` exists.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlyrInstance = any

/**
 * Renders a vault video file using Plyr for playback controls.
 * Reads the file from the FS adapter, creates a blob URL, and revokes
 * it on unmount to avoid memory leaks.
 */
export function VideoPlayerView({
  vaultFs,
  path,
  title,
}: {
  vaultFs: FileSystemAdapter
  path: string
  title: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<PlyrInstance>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load video bytes from vault FS → blob URL
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
        console.error('Failed to load video:', path, err)
        setError(`Could not load video: ${path}`)
      })

    return () => {
      revoked = true
      if (url) URL.revokeObjectURL(url)
      setBlobUrl(null)
    }
  }, [vaultFs, path])

  // Initialise / destroy Plyr instance (dynamic import to avoid SSR crash)
  useEffect(() => {
    const el = videoRef.current
    if (!el || !blobUrl) return

    let player: PlyrInstance = null
    let cancelled = false

    void import('plyr').then((mod) => {
      if (cancelled) return
      const Plyr = mod.default
      player = new Plyr(el, {
        controls: [
          'play-large',
          'play',
          'progress',
          'current-time',
          'duration',
          'mute',
          'volume',
          'settings',
          'pip',
          'fullscreen',
        ],
        settings: ['speed'],
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
      })
      playerRef.current = player
    })

    return () => {
      cancelled = true
      player?.destroy()
      playerRef.current = null
    }
  }, [blobUrl])

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
    <div className="flex flex-1 items-center justify-center overflow-auto p-4">
      <div className="w-full max-w-4xl">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} src={blobUrl} className="w-full rounded" />
      </div>
    </div>
  )
}
