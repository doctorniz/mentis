import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, SendHorizontal, X } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { captureDestinations } from '@/core/registries'
import {
  DEFAULT_CAPTURE_DESTINATION,
  type CaptureContext,
  type CaptureDestination,
  type ParseResult,
  type PreviewChip,
} from '@/core/registries/capture'
import { toast } from '@/stores/toast'
import { cn } from '@/utils/cn'

export interface CaptureBarProps {
  /** Skip the picker and hide the sigil: everything goes here unless `/` picks another. */
  boundDestination?: string
  /** Values the bound destination is pre-filled with, e.g. `{ list: 'Shopping' }`. */
  scope?: Record<string, unknown>
  /** Commit to the bound destination on Enter with no confirmation. */
  immediate?: boolean
  placeholder?: string
  /** Docked at the top of a view (picker opens below) or the bottom (opens above). */
  placement?: 'top' | 'bottom'
  /** Start a voice thought. The mic shows only when the host view can record. */
  onRecord?: () => void
}

const UNDO_MS = 10_000

const CHIP_CLASS: Record<PreviewChip['tone'], string> = {
  urgent: 'rounded-md bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 font-medium',
  high: 'rounded-md bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 font-medium',
  medium: 'rounded-md bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-medium',
  low: 'rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 font-medium',
  tag: 'rounded-full bg-accent/10 text-accent',
  date: 'rounded-md bg-bg-tertiary text-fg-muted',
  repeat: 'rounded-md bg-accent/15 text-accent font-medium',
}

/**
 * The capture bar. Its first character picks the mode: `/` opens the
 * destination picker, `>` opens the command palette, anything else goes to
 * the bound destination or Thoughts. A write finishes before the bar clears,
 * so nothing acknowledged can be lost.
 */
export function CaptureBar({
  boundDestination,
  scope,
  immediate = false,
  placeholder,
  placement = 'top',
  onRecord,
}: CaptureBarProps) {
  const { vaultFs } = useVaultSession()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  /** A destination picked with `/`, shown as a chip. */
  const [picked, setPicked] = useState<CaptureDestination | null>(null)
  const [pickerIndex, setPickerIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<{ message: string; undo?: () => Promise<void> } | null>(null)
  const [fullParse, setFullParse] = useState<{ text: string; result: ParseResult } | null>(null)

  const bound = boundDestination ? captureDestinations.get(boundDestination) : undefined
  const fallback = bound ?? captureDestinations.get(DEFAULT_CAPTURE_DESTINATION)!
  const pickerOpen = !picked && text.startsWith('/') && !/\s/.test(text)
  const pickerItems = pickerOpen ? captureDestinations.search(text.slice(1)) : []
  const destination = picked ?? fallback

  // Context identity changes only with what it carries.
  const scopeKey = JSON.stringify(scope ?? {})
  const ctx = useMemo<Omit<CaptureContext, 'now'>>(
    () => ({ vaultFs, scope: JSON.parse(scopeKey) as Record<string, unknown> }),
    [vaultFs, scopeKey],
  )

  useEffect(() => destination.preload?.(), [destination])
  useEffect(() => setPickerIndex(0), [text])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(null), UNDO_MS)
    return () => clearTimeout(t)
  }, [saved])

  // The quick parse shows at once; the full one (natural dates) replaces it when ready.
  const payload = pickerOpen ? '' : text
  const quick = useMemo(
    () => (payload.trim() ? destination.parseNow(payload, { ...ctx, now: new Date() }) : null),
    [payload, destination, ctx],
  )
  useEffect(() => {
    if (!payload.trim()) return
    let cancelled = false
    const t = setTimeout(() => {
      void destination
        .parse(payload, { ...ctx, now: new Date() })
        .then((result) => {
          if (!cancelled) setFullParse({ text: payload, result })
        })
        .catch(() => {})
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [payload, destination, ctx])
  const shown = fullParse?.text === payload ? fullParse.result : quick
  const chips = shown && destination.preview ? destination.preview(shown.values) : []

  function choose(d: CaptureDestination | undefined) {
    if (!d) return
    setPicked(d === bound ? null : d)
    setText('')
    inputRef.current?.focus()
  }

  function onChange(next: string) {
    if (!picked && next.startsWith('>')) {
      // `>` is the command palette; the bar is for capture.
      window.dispatchEvent(
        new CustomEvent('ink:open-command-palette', { detail: { query: next.slice(1) } }),
      )
      setText('')
      return
    }
    // `/word ` with a known sigil picks it, and the rest becomes the payload.
    const sigil = !picked && /^(\/\S+)\s(.*)$/s.exec(next)
    const named = sigil ? captureDestinations.bySigil(sigil[1]!) : undefined
    if (sigil && named) {
      setPicked(named === bound ? null : named)
      setText(sigil[2]!)
      return
    }
    setText(next)
  }

  async function commit() {
    if (busy || !text.trim()) return
    const target = destination
    // A destination that asks for confirmation commits directly only from a bar bound to it as immediate.
    if (!target.immediate && !(immediate && target === bound)) {
      // Confirmation modals are not built yet, and every registered destination is immediate.
      toast.info(`${target.label} needs a confirmation step that is not available yet`)
      return
    }
    setBusy(true)
    try {
      const full = { ...ctx, now: new Date() }
      const parsed = await target.parse(text, full)
      const result = await target.write(parsed.values, full)
      if (!result) return
      setText('')
      setPicked(null)
      setSaved(result.message ? { message: result.message, undo: result.undo } : null)
    } catch (err) {
      console.error(`Capture to ${target.label} failed:`, err)
      toast.error(`Could not save to ${target.label}`)
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (pickerOpen && pickerItems.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setPickerIndex((i) => (i + step + pickerItems.length) % pickerItems.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        choose(pickerItems[pickerIndex])
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      void commit()
    } else if (e.key === 'Escape') {
      if (text) setText('')
      else if (picked) setPicked(null)
    } else if (e.key === 'Backspace' && !text && picked) {
      setPicked(null)
    }
  }

  async function undo() {
    const s = saved
    setSaved(null)
    try {
      await s?.undo?.()
    } catch (err) {
      console.error('Undo failed:', err)
      toast.error('Could not undo')
    }
  }

  const Icon = destination.icon
  const showMic = !!onRecord && !text && destination.id === DEFAULT_CAPTURE_DESTINATION

  return (
    <div
      className={cn(
        'border-border relative px-3 py-2.5 sm:px-4',
        placement === 'top' ? 'border-b' : 'border-t',
      )}
    >
      <div className="flex items-center gap-2.5">
        {picked ? (
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="bg-accent/10 text-accent flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            aria-label={`Capturing to ${picked.label}; remove`}
          >
            <Icon className="size-3.5" aria-hidden />
            {picked.label}
            <X className="size-3" aria-hidden />
          </button>
        ) : (
          <Icon className="text-fg-muted/50 size-4 shrink-0" aria-hidden />
        )}
        <input
          ref={inputRef}
          type="text"
          value={text}
          readOnly={busy}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            placeholder ??
            (picked ? `${picked.hint}` : 'Capture a thought…   / for destinations, > for commands')
          }
          aria-label="Capture"
          className="text-fg placeholder:text-fg-muted/40 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {showMic ? (
          <button
            type="button"
            onClick={onRecord}
            className="text-fg-muted hover:text-fg shrink-0 rounded p-1 transition-colors"
            aria-label="Record a voice thought"
          >
            <Mic className="size-4" />
          </button>
        ) : (
          text.trim() &&
          !pickerOpen && (
            <button
              type="button"
              onClick={() => void commit()}
              disabled={busy}
              className="text-accent hover:text-accent/80 shrink-0 rounded p-1 transition-colors disabled:opacity-50"
              aria-label={`Save to ${destination.label}`}
            >
              <SendHorizontal className="size-4" />
            </button>
          )
        )}
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-3.5 sm:pl-6">
          {chips.map((chip, i) => (
            <span key={i} className={cn('px-1.5 py-0.5 text-[10px]', CHIP_CLASS[chip.tone])}>
              {chip.text}
            </span>
          ))}
        </div>
      )}

      {saved && (
        <p className="text-fg-muted mt-1.5 pl-6 text-xs" role="status">
          {saved.message}
          {saved.undo && (
            <>
              {' · '}
              <button
                type="button"
                onClick={() => void undo()}
                className="text-accent hover:underline"
              >
                Undo
              </button>
            </>
          )}
        </p>
      )}

      {pickerOpen && (
        <div
          role="listbox"
          aria-label="Destinations"
          className={cn(
            'border-border bg-bg absolute left-3 z-50 w-72 rounded-lg border py-1 shadow-lg sm:left-4',
            placement === 'top' ? 'top-full mt-1' : 'bottom-full mb-1',
          )}
        >
          {pickerItems.length === 0 && (
            <p className="text-fg-muted px-3 py-2 text-xs">No destination matches</p>
          )}
          {pickerItems.map((d, i) => {
            const DIcon = d.icon
            return (
              <button
                key={d.id}
                type="button"
                role="option"
                aria-selected={i === pickerIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(d)}
                onMouseMove={() => setPickerIndex(i)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-1.5 text-left',
                  i === pickerIndex && 'bg-accent-light',
                )}
              >
                <DIcon className="text-fg-muted size-4 shrink-0" aria-hidden />
                <span className="text-fg text-sm">{d.label}</span>
                <span className="text-fg-muted font-mono text-xs">{d.sigil}</span>
                <span className="text-fg-muted ml-auto truncate text-xs">{d.hint}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
