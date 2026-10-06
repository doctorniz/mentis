import type { TaskPriority } from '@/types/tasks'
import { formatLocalDate, nextWeekdayOnOrAfter } from '@/lib/tasks/recurrence'
import {
  CaptureText,
  extractExplicitDate,
  extractPriority,
  extractRecurrence,
  extractTags,
  extractWeekday,
} from '@/core/capture/parse'

export interface QuickAddResult {
  title: string
  priority?: TaskPriority
  tags: string[]
  due?: string
  repeat?: 'weekly'
  repeatWeekday?: number
}

/**
 * The task destination's explicit parse, in order: `!n` priority, `#tags`,
 * `>date`, then a recurring weekday (`every monday`) or a single one
 * (`on friday`). Explicit always wins: a `>date` beats an inferred one.
 * Returns the parsing state too, so natural-language dates can run next on
 * what is left (see ./capture).
 */
export function parseQuickAddText(input: string, now: Date = new Date()) {
  const text = new CaptureText(input)
  const priority = extractPriority(text)
  const tags = extractTags(text)
  const explicitDue = extractExplicitDate(text, now)
  const recurrence = extractRecurrence(text)
  // With a recurrence or an explicit date, a single weekday would be ignored — leave it in the title.
  const weekdayDue = recurrence || explicitDue ? undefined : extractWeekday(text, now)

  const due =
    explicitDue ??
    (recurrence ? formatLocalDate(nextWeekdayOnOrAfter(now, recurrence.repeatWeekday)) : weekdayDue)

  const result: QuickAddResult = recurrence
    ? { title: text.residual(), priority, tags, due, ...recurrence }
    : { title: text.residual(), priority, tags, due }
  return { result, text }
}

export function parseQuickAdd(input: string): QuickAddResult {
  return parseQuickAddText(input).result
}
