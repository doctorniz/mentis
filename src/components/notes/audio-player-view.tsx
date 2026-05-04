'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, FileText, Loader2, Mic } from 'lucide-react'

import type { FileSystemAdapter } from '@/lib/fs'
import { assetToBlobUrl } from '@/lib/notes/assets'

/**
 * Vault audio file viewer — Plyr-powered player + optional Whisper transcription.
 *
 * Plyr is dynamically imported (browser-only) to avoid crashing the static
 * export prerender. Its CSS is loaded globally in globals.css.
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
  const audioRef = useRef<HTMLAudioElement>(null)
  const plyrRef = useRef<{ destroy: () => void } | null>(null)

  // Transcription state
  const [transcript, setTranscript] = useState<string | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [whisperProgress, setWhisperProgress] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Load audio file as blob URL
  useEffect(() => {
    let revoked = false
    let url: string | null = null

    void assetToBlobUrl(vaultFs, path)
      .then((u) => {
        if (revoked) { URL.revokeObjectURL(u); return }
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

  // Init Plyr once the blob URL is ready and the audio element is mounted
  useEffect(() => {
    if (!blobUrl || !audioRef.current) return

    let instance: { destroy: () => void } | null = null

    void import('plyr').then(({ default: Plyr }) => {
      if (!audioRef.current) return
      instance = new Plyr(audioRef.current, {
        controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'speed'],
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
        keyboard: { focused: true, global: false },
        tooltips: { controls: true, seek: true },
        invertTime: false,
      })
      plyrRef.current = instance
    })

    return () => {
      instance?.destroy()
      plyrRef.current = null
    }
  }, [blobUrl])

  // Track Whisper model download progress
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { status: string; progress?: number }
      if (detail.status === 'progress' && detail.progress != null) {
        setWhisperProgress(`${Math.round(detail.progress)}%`)
      } else if (detail.status === 'ready') {
        setWhisperProgress(null)
      }
    }
    window.addEventListener('ink:whisper-progress', handler)
    return () => window.removeEventListener('ink:whisper-progress', handler)
  }, [])

  const handleTranscribe = useCallback(async () => {
    if (transcribing) return
    setTranscribing(true)
    try {
      const audioBytes = await vaultFs.readFile(path)
      const { transcribeAudio } = await import('@/lib/audio/transcribe')
      const { text } = await transcribeAudio(audioBytes as Uint8Array<ArrayBuffer>)
      if (text) setTranscript(text)
    } catch (err) {
      console.error('Transcription failed:', err)
    } finally {
      setTranscribing(false)
      setWhisperProgress(null)
    }
  }, [vaultFs, path, transcribing])

  const handleCopy = useCallback(async () => {
    if (!transcript) return
    await navigator.clipboard.writeText(transcript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [transcript])

  const handleRetranscribe = useCallback(() => {
    setTranscript(null)
  }, [])

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
      <div className="flex w-full max-w-lg flex-col gap-5">
        {/* File header */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-accent/10">
            <Mic className="size-8 text-accent" />
          </div>
          <h2 className="text-fg text-lg font-semibold">{title}</h2>
        </div>

        {/* Plyr player — wraps a plain <audio> element */}
        <div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} src={blobUrl} preload="metadata" />
        </div>

        {/* Whisper transcription */}
        {!transcript ? (
          <button
            type="button"
            onClick={handleTranscribe}
            disabled={transcribing}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg px-4 py-2.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {transcribing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {whisperProgress ? `Downloading model… ${whisperProgress}` : 'Transcribing…'}
              </>
            ) : (
              <>
                <FileText className="size-4" />
                Transcribe
              </>
            )}
          </button>
        ) : (
          <div className="rounded-xl border border-border bg-bg-secondary p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-fg-muted text-xs font-medium tracking-wide uppercase">
                Transcript
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleRetranscribe}
                  className="rounded px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                >
                  Redo
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                >
                  {copied
                    ? <Check className="size-3 text-green-500" />
                    : <Copy className="size-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <p className="text-fg text-sm leading-relaxed">{transcript}</p>
          </div>
        )}
      </div>
    </div>
  )
}
