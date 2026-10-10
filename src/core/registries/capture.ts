import type { LucideIcon } from 'lucide-react'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { MatchedSpan } from '@/core/capture/parse'

/**
 * Capture destination registry.
 *
 * Everything typed into the capture bar goes to one destination: Thoughts by
 * default, or one picked with its `/sigil`. Modules contribute destinations
 * from `src/modules/<name>/capture.ts`. A destination parses the input into
 * field values and writes them; what the parse does not claim stays in the
 * title or body, so nothing typed is dropped.
 */

export interface CaptureContext {
  vaultFs: FileSystemAdapter
  /** Values the bar is bound to, e.g. `{ list: 'Shopping' }` in a task list. */
  scope: Readonly<Record<string, unknown>>
  now: Date
}

export interface ParseResult {
  values: Record<string, unknown>
  /** What each part of the input became; drives the preview. */
  matchedSpans: readonly MatchedSpan[]
  /** The input without matched spans — the title or body. */
  residual: string
}

/** A chip in the bar's preview of what will be saved. */
export interface PreviewChip {
  text: string
  tone: 'urgent' | 'high' | 'medium' | 'low' | 'tag' | 'date' | 'repeat'
}

export interface WriteResult {
  /** Shown after saving, with Undo when `undo` is given. */
  message?: string
  undo?: () => Promise<void>
  /** Offered beside the message: creating a note usually means writing in it. */
  open?: () => void
}

interface FieldBase {
  /** The key in the values; a parse span with this field name marks it auto-filled. */
  key: string
  label: string
  hint?: string
  required?: boolean
  visible?: (values: Record<string, unknown>) => boolean
}

/** One field of a destination's confirmation dialog. */
export type CaptureFieldSpec = FieldBase &
  (
    | { kind: 'text' | 'url' | 'textarea'; placeholder?: string }
    | { kind: 'date' | 'toggle' | 'tags' | 'folder' }
    | {
        kind: 'datetime'
        /** Show a date only (all-day), keeping the value as YYYY-MM-DD. */
        dateOnly?: (values: Record<string, unknown>) => boolean
      }
    | { kind: 'select'; options: readonly { value: string; label: string }[] }
    | {
        /** Pick an existing name or type a new one. Empty means `emptyLabel`. */
        kind: 'combobox'
        options: (ctx: CaptureContext) => Promise<string[]>
        emptyLabel: string
      }
  )

export interface CaptureDestination {
  id: string
  /** Typed to pick it, `/task`. */
  sigil: string
  aliases: readonly string[]
  label: string
  icon: LucideIcon
  /** An example input, shown in the picker. */
  hint: string
  /** Commit on Enter with no confirmation. */
  immediate: boolean
  /** The quick part of the parse — explicit modifiers only. Must not wait. */
  parseNow(input: string, ctx: CaptureContext): ParseResult
  /** The full parse, natural-language dates included. */
  parse(input: string, ctx: CaptureContext): Promise<ParseResult>
  preview?(values: Record<string, unknown>): readonly PreviewChip[]
  /** The value key the unparsed text fills (the title or body), marked auto-filled too. */
  residualField?: string
  /** The confirmation dialog's fields. Needed when `immediate` is false. */
  fields?(values: Record<string, unknown>, ctx: CaptureContext): readonly CaptureFieldSpec[]
  /** A message when the values cannot be saved yet, e.g. an end before the start. */
  validate?(values: Record<string, unknown>): string | null
  /** Best-effort extra values fetched while the dialog is open (a page title). Never blocks saving. */
  enrich?(values: Record<string, unknown>): Promise<Record<string, unknown>>
  /** Write the values. Resolves to null when there is nothing to save (no title). */
  write(values: Record<string, unknown>, ctx: CaptureContext): Promise<WriteResult | null>
  /** Load whatever `parse` needs, ahead of the first use. */
  preload?(): void
}

/** Where bare text goes. */
export const DEFAULT_CAPTURE_DESTINATION = 'thought'

export interface CaptureRegistry {
  all(): readonly CaptureDestination[]
  get(id: string): CaptureDestination | undefined
  /** The destination a typed `/word` names exactly, by sigil or alias. */
  bySigil(word: string): CaptureDestination | undefined
  /** Destinations whose sigil, alias or label contain `query` (without its `/`). */
  search(query: string): CaptureDestination[]
}

export function createCaptureRegistry(
  destinations: readonly CaptureDestination[],
): CaptureRegistry {
  const byId = new Map<string, CaptureDestination>()
  const bySigil = new Map<string, CaptureDestination>()
  for (const d of destinations) {
    if (byId.has(d.id)) throw new Error(`Capture destination "${d.id}" is registered twice`)
    byId.set(d.id, d)
    for (const s of [d.sigil, ...d.aliases]) {
      const key = s.toLowerCase()
      const owner = bySigil.get(key)
      if (owner) throw new Error(`Sigil "${s}" is claimed by "${owner.id}" and "${d.id}"`)
      bySigil.set(key, d)
    }
  }
  return {
    all: () => destinations,
    get: (id) => byId.get(id),
    bySigil: (word) => bySigil.get(word.toLowerCase()),
    search(query) {
      const q = query.replace(/^\//, '').toLowerCase()
      return destinations.filter(
        (d) =>
          !q ||
          d.label.toLowerCase().includes(q) ||
          [d.sigil, ...d.aliases].some((s) => s.slice(1).toLowerCase().startsWith(q)),
      )
    },
  }
}
