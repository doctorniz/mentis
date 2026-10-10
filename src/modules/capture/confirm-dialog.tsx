import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FolderOpen, Loader2 } from 'lucide-react'
import type {
  CaptureContext,
  CaptureDestination,
  CaptureFieldSpec,
  ParseResult,
  WriteResult,
} from '@/core/registries/capture'
import type { MatchedSpan } from '@/core/capture/parse'
import { listVaultFolders } from '@/components/settings/folder-list'
import { cn } from '@/utils/cn'

export interface CaptureConfirmDialogProps {
  destination: CaptureDestination
  /** What was typed (without the destination's sigil), for the preview line. */
  input: string
  parsed: ParseResult
  ctx: CaptureContext
  onSaved: (result: WriteResult) => void
  onCancel: () => void
}

/** Tints for the preview line, one per field in order of first appearance. */
const TINTS = [
  'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
]

const INPUT =
  'border-border bg-bg-secondary text-fg w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50'

/** The input with each matched span tinted by the field it filled — the parse, checkable at a glance. */
function PreviewLine({
  input,
  spans,
  labels,
}: {
  input: string
  spans: readonly MatchedSpan[]
  labels: Map<string, string>
}) {
  const order = [...new Set(spans.map((s) => s.field))]
  const parts: React.ReactNode[] = []
  let at = 0
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start > at) parts.push(input.slice(at, span.start))
    const tint = TINTS[order.indexOf(span.field) % TINTS.length]
    parts.push(
      <mark
        key={span.start}
        title={labels.get(span.field) ?? span.field}
        data-field={span.field}
        className={cn('rounded px-0.5', tint)}
      >
        {input.slice(span.start, span.end)}
      </mark>,
    )
    at = span.end
  }
  if (at < input.length) parts.push(input.slice(at))
  return (
    <p
      className="text-fg bg-bg-secondary rounded-md px-3 py-2 text-sm leading-relaxed"
      aria-label="What was understood"
    >
      {parts}
    </p>
  )
}

function FolderSelect({
  value,
  onChange,
  ctx,
  id,
}: {
  value: string
  onChange: (v: string) => void
  ctx: CaptureContext
  id: string
}) {
  const [folders, setFolders] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    void listVaultFolders(ctx.vaultFs).then((all) => {
      // Notebooks and their sections: system folders (`_`, `.`) are not notebooks.
      const user = all.filter((f) => f === '/' || !/\/[_.]/.test(f))
      if (!cancelled) setFolders(user)
    })
    return () => {
      cancelled = true
    }
  }, [ctx.vaultFs])
  const current = value ? `/${value}` : '/'
  return (
    <div className="relative">
      <FolderOpen className="text-fg-muted pointer-events-none absolute top-2 left-2.5 size-3.5" />
      <select
        id={id}
        value={current}
        onChange={(e) => onChange(e.target.value === '/' ? '' : e.target.value.slice(1))}
        className={cn(INPUT, 'pl-8')}
      >
        {!folders.includes(current) && <option value={current}>{current}</option>}
        {folders.map((f) => (
          <option key={f} value={f}>
            {f === '/' ? 'Unfiled (vault root)' : f.slice(1)}
          </option>
        ))}
      </select>
    </div>
  )
}

function Combobox({
  field,
  value,
  onChange,
  ctx,
  id,
}: {
  field: Extract<CaptureFieldSpec, { kind: 'combobox' }>
  value: string
  onChange: (v: string) => void
  ctx: CaptureContext
  id: string
}) {
  const [options, setOptions] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    void field.options(ctx).then((o) => !cancelled && setOptions(o))
    return () => {
      cancelled = true
    }
  }, [field, ctx])
  const isNew = value.trim() !== '' && !options.includes(value.trim())
  return (
    <>
      <input
        id={id}
        list={`${id}-options`}
        value={value}
        placeholder={field.emptyLabel}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      />
      <datalist id={`${id}-options`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {isNew && <p className="text-fg-muted mt-1 text-xs">Creates “{value.trim()}”</p>}
    </>
  )
}

/**
 * The confirmation step for destinations that are not instant. The preview
 * line shows what the parser took; each field it filled is marked until
 * touched. Enter saves from a single-line field, Ctrl/⌘+Enter from anywhere,
 * Esc cancels — asking first if a field was edited.
 */
export default function CaptureConfirmDialog({
  destination,
  input,
  parsed,
  ctx,
  onSaved,
  onCancel,
}: CaptureConfirmDialogProps) {
  const [values, setValues] = useState<Record<string, unknown>>(parsed.values)
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const touchedRef = useRef(touched)
  touchedRef.current = touched

  const fields = useMemo(
    () => (destination.fields?.(values, ctx) ?? []).filter((f) => !f.visible || f.visible(values)),
    [destination, values, ctx],
  )
  const labels = useMemo(() => new Map(fields.map((f) => [f.key, f.label])), [fields])
  const autoFilled = useMemo(() => {
    const keys = new Set(parsed.matchedSpans.map((s) => s.field))
    if (destination.residualField && parsed.residual) keys.add(destination.residualField)
    return keys
  }, [parsed, destination])

  // Enrich once (a page title, say); never overwrite what the user has typed.
  useEffect(() => {
    if (!destination.enrich) return
    let cancelled = false
    void destination
      .enrich(parsed.values)
      .then((extra) => {
        if (cancelled) return
        setValues((v) => {
          const next = { ...v }
          for (const [k, val] of Object.entries(extra))
            if (!touchedRef.current.has(k)) next[k] = val
          return next
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [destination, parsed])

  function set(key: string, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }))
    setTouched((t) => (t.has(key) ? t : new Set(t).add(key)))
    setError(null)
    setConfirmDiscard(false)
  }

  async function save() {
    if (saving) return
    const missing = fields.find(
      (f) => f.required && f.kind !== 'toggle' && !String(values[f.key] ?? '').trim(),
    )
    const problem = missing ? `${missing.label} is required` : destination.validate?.(values)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      const result = await destination.write(values, ctx)
      onSaved(result ?? {})
    } catch (err) {
      console.error(`Saving to ${destination.label} failed:`, err)
      setError(err instanceof Error ? err.message : `Could not save to ${destination.label}`)
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void save()
    } else if (
      e.key === 'Enter' &&
      e.target instanceof HTMLInputElement &&
      e.target.type !== 'checkbox' &&
      !e.target.list
    ) {
      e.preventDefault()
      void save()
    }
  }

  function requestCancel() {
    if (touched.size > 0 && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    onCancel()
  }

  const Icon = destination.icon

  function control(f: CaptureFieldSpec) {
    const id = `capture-${f.key}`
    const raw = values[f.key]
    const str = raw == null ? '' : String(raw)
    switch (f.kind) {
      case 'text':
      case 'url':
        return (
          <input
            id={id}
            type={f.kind === 'url' ? 'url' : 'text'}
            value={str}
            placeholder={f.placeholder}
            onChange={(e) => set(f.key, e.target.value)}
            className={INPUT}
          />
        )
      case 'textarea':
        return (
          <textarea
            id={id}
            rows={3}
            value={str}
            placeholder={f.placeholder}
            onChange={(e) => set(f.key, e.target.value)}
            className={cn(INPUT, 'resize-y')}
          />
        )
      case 'date':
        return (
          <input
            id={id}
            type="date"
            value={str}
            onChange={(e) => set(f.key, e.target.value)}
            className={INPUT}
          />
        )
      case 'datetime': {
        const dateOnly = f.dateOnly?.(values) ?? false
        return (
          <input
            id={id}
            type={dateOnly ? 'date' : 'datetime-local'}
            value={dateOnly ? str.slice(0, 10) : str}
            onChange={(e) => set(f.key, e.target.value)}
            className={INPUT}
          />
        )
      }
      case 'toggle':
        return (
          <input
            id={id}
            type="checkbox"
            checked={raw === true}
            onChange={(e) => set(f.key, e.target.checked)}
            className="accent-accent size-4"
          />
        )
      case 'select':
        return (
          <select
            id={id}
            value={str}
            onChange={(e) => set(f.key, e.target.value)}
            className={INPUT}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      case 'tags':
        return (
          <input
            id={id}
            value={Array.isArray(raw) ? raw.map((t) => `#${t}`).join(' ') : ''}
            placeholder="#tag"
            onChange={(e) =>
              set(
                f.key,
                e.target.value
                  .split(/[\s,]+/)
                  .map((t) => t.replace(/^#/, '').toLowerCase())
                  .filter(Boolean),
              )
            }
            className={INPUT}
          />
        )
      case 'folder':
        return <FolderSelect id={id} value={str} onChange={(v) => set(f.key, v)} ctx={ctx} />
      case 'combobox':
        return <Combobox id={id} field={f} value={str} onChange={(v) => set(f.key, v)} ctx={ctx} />
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && requestCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[199] bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            requestCancel()
          }}
          onPointerDownOutside={(e) => {
            e.preventDefault()
            requestCancel()
          }}
          className="border-border bg-bg fixed top-[12vh] left-1/2 z-[200] flex max-h-[80vh] w-[min(100vw-2rem,520px)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border shadow-xl outline-none"
        >
          <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
            <Icon className="text-accent size-4" aria-hidden />
            <Dialog.Title className="text-fg text-base font-semibold">
              {destination.label}
            </Dialog.Title>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {input.trim() && (
              <PreviewLine input={input} spans={parsed.matchedSpans} labels={labels} />
            )}
            {fields.map((f) => {
              const auto = autoFilled.has(f.key) && !touched.has(f.key)
              return (
                <div
                  key={f.key}
                  className={f.kind === 'toggle' ? 'flex items-center justify-between gap-3' : ''}
                >
                  <label
                    htmlFor={`capture-${f.key}`}
                    className="text-fg mb-1 flex items-center gap-2 text-xs font-medium"
                  >
                    {f.label}
                    {f.required && <span className="text-fg-muted">*</span>}
                    {auto && (
                      <span
                        className="bg-accent/10 text-accent rounded px-1.5 py-px text-[10px]"
                        data-autofilled={f.key}
                      >
                        auto
                      </span>
                    )}
                  </label>
                  {control(f)}
                  {f.hint && <p className="text-fg-muted mt-1 text-xs">{f.hint}</p>}
                </div>
              )
            })}
          </div>

          {(error || confirmDiscard) && (
            <p
              role="alert"
              className={cn('px-5 pb-2 text-xs', error ? 'text-danger' : 'text-fg-secondary')}
            >
              {error ?? 'Discard your changes? Press Esc again, or Cancel, to discard.'}
            </p>
          )}

          <div className="border-border flex items-center justify-between border-t px-5 py-3">
            <button
              type="button"
              onClick={requestCancel}
              className="text-fg-secondary hover:text-fg rounded-lg px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="bg-accent text-accent-fg hover:bg-accent/90 flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
