import type { ParsedResult } from 'chrono-node'
import { formatLocalDate } from '@/lib/tasks/recurrence'
import type { CaptureText } from '@/core/capture/parse'

/**
 * Natural-language dates via chrono-node — deterministic, never AI. Loaded
 * on first use (about 13 KB gzipped), so nothing that never parses a date
 * pays for it. Runs after the explicit modifiers, on what they left.
 */
let chrono: Promise<typeof import('./chrono-en')> | null = null

function loadChrono() {
  chrono ??= import('./chrono-en')
  return chrono
}

/** Start loading chrono-node now, so the first parse does not wait for it. */
export function preloadDates(): void {
  void loadChrono().catch(() => {
    chrono = null
  })
}

/** What a destination can store of a date: a day only, or a day and time. */
export interface DateCapacity {
  time: boolean
  range: boolean
}

/**
 * The first natural-language date the destination can store entirely —
 * a phrase with a time or a range it cannot keep stays in the text — claimed
 * as `field`. Returns the day as YYYY-MM-DD and the full result.
 */
export async function extractNaturalDate(
  text: CaptureText,
  capacity: DateCapacity,
  field = 'due',
  now: Date = new Date(),
): Promise<{ date: string; result: ParsedResult } | undefined> {
  const { parse } = await loadChrono()
  for (const result of parse(text.unclaimed, now, { forwardDate: true })) {
    if (result.start.isCertain('hour') && !capacity.time) continue
    if (result.end && !capacity.range) continue
    text.claim(result.index, result.index + result.text.length, field)
    return { date: formatLocalDate(result.start.date()), result }
  }
  return undefined
}
