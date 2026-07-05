'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/utils/cn'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const SPEEDS = [1, 1.25, 1.5, 2, 0.5, 0.75] as const

interface AudioPlayerProps {
  /** Blob URL or object URL pointing to the audio file. */
  src: string
  /** Optional known duration in seconds (for display before metadata loads). */
  duration?: number
  /** Compact mode for board cards. */
  compact?: boolean
  className?: string
}

/**
 * Reusable audio player with play/pause, seekable progress bar,
 * elapsed/total time, and playback speed toggle.
 */
export function AudioPlayer({ src, duration: hintDuration, compact, className }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(hintDuration ?? 0)
  const [speedIdx, setSpeedIdx] = useState(0)
  const progressRef = useRef<HTMLDivElement>(null)

  // Sync audio metadata
  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    function onMeta() {
      if (el && isFinite(el.duration)) setDuration(el.duration)
    }
    function onTime() {
      if (el) setCurrentTime(el.currentTime)
    }
    function onEnded() {
      setPlaying(false)
      setCurrentTime(0)
    }

    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnded)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnded)
    }
  }, [src])

  const togglePlay = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
    } else {
      void el.play()
      setPlaying(true)
    }
  }, [playing])

  const seek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = audioRef.current
      const bar = progressRef.current
      if (!el || !bar || !duration) return
      const rect = bar.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      el.currentTime = ratio * duration
      setCurrentTime(el.currentTime)
    },
    [duration],
  )

  const cycleSpeed = useCallback(() => {
    const next = (speedIdx + 1) % SPEEDS.length
    setSpeedIdx(next)
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next]
  }, [speedIdx])

  const restart = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    el.currentTime = 0
    setCurrentTime(0)
    void el.play()
    setPlaying(true)
  }, [])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className={cn('flex items-center gap-2', compact ? 'gap-1.5' : 'gap-3', className)}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause */}
      <button
        type="button"
        onClick={togglePlay}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full transition-colors',
          compact
            ? 'bg-accent/10 text-accent hover:bg-accent/20 size-7'
            : 'bg-accent text-accent-fg hover:bg-accent/90 size-9',
        )}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <Pause className={compact ? 'size-3' : 'size-4'} />
        ) : (
          <Play className={cn(compact ? 'size-3' : 'size-4', 'ml-0.5')} />
        )}
      </button>

      {/* Progress bar */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div
          ref={progressRef}
          onClick={seek}
          className={cn(
            'bg-fg/10 relative w-full cursor-pointer rounded-full',
            compact ? 'h-1' : 'h-1.5',
          )}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className="bg-accent absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Time + speed */}
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'text-fg-muted font-mono select-none',
              compact ? 'text-[9px]' : 'text-[10px]',
            )}
          >
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="flex items-center gap-1">
            {!compact && (
              <button
                type="button"
                onClick={restart}
                className="text-fg-muted hover:text-fg rounded p-0.5 transition-colors"
                aria-label="Restart"
              >
                <RotateCcw className="size-3" />
              </button>
            )}
            <button
              type="button"
              onClick={cycleSpeed}
              className={cn(
                'text-fg-muted hover:text-fg rounded px-1 font-mono transition-colors',
                compact ? 'text-[9px]' : 'text-[10px]',
              )}
              aria-label={`Speed: ${SPEEDS[speedIdx]}x`}
            >
              {SPEEDS[speedIdx]}x
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
