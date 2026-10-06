import { CheckSquare } from 'lucide-react'
import type { CaptureDestination, ParseResult, PreviewChip } from '@/core/registries/capture'
import { extractNaturalDate, preloadDates } from '@/core/capture/dates'
import { PRIORITY_LABELS, WEEKDAY_LABEL, type TaskPriority } from '@/types/tasks'
import { parseQuickAddText, type QuickAddResult } from './parse-quick-add'

const PRIORITY_TONE: Record<TaskPriority, PreviewChip['tone']> = {
  1: 'urgent',
  2: 'high',
  3: 'medium',
  4: 'low',
}

function toParseResult(
  result: QuickAddResult,
  spans: ParseResult['matchedSpans'],
  list: unknown,
): ParseResult {
  return {
    values: { ...result, list: typeof list === 'string' ? list : null },
    matchedSpans: spans,
    residual: result.title,
  }
}

/**
 * A task in `_mentis/_tasks/<list>/`. Explicit modifiers first (`!2 #home
 * >friday`, `every monday`); then, if no date was given, a natural-language
 * one — a day only, since a task has no time or range to keep the rest in.
 */
const task: CaptureDestination = {
  id: 'task',
  sigil: '/task',
  aliases: ['/todo'],
  label: 'Task',
  icon: CheckSquare,
  hint: 'Call the plumber tomorrow !2 #home',
  immediate: true,
  preload: preloadDates,
  parseNow(input, { now, scope }) {
    const { result, text } = parseQuickAddText(input, now)
    return toParseResult(result, text.spans, scope.list)
  },
  async parse(input, { now, scope }) {
    const { result, text } = parseQuickAddText(input, now)
    if (!result.due) {
      const natural = await extractNaturalDate(text, { time: false, range: false }, 'due', now)
      if (natural) {
        result.due = natural.date
        result.title = text.residual()
      }
    }
    return toParseResult(result, text.spans, scope.list)
  },
  preview(values) {
    const v = values as unknown as QuickAddResult
    const chips: PreviewChip[] = []
    if (v.priority)
      chips.push({ text: PRIORITY_LABELS[v.priority], tone: PRIORITY_TONE[v.priority] })
    for (const tag of v.tags ?? []) chips.push({ text: `#${tag}`, tone: 'tag' })
    if (v.due) chips.push({ text: v.due, tone: 'date' })
    if (v.repeat === 'weekly' && v.repeatWeekday != null)
      chips.push({ text: `Weekly · ${WEEKDAY_LABEL[v.repeatWeekday]}`, tone: 'repeat' })
    return chips
  },
  async write(values, { vaultFs }) {
    const v = values as unknown as QuickAddResult & { list: string | null }
    if (!v.title) return null
    // The store loads with the first task saved, not with the app.
    const { useTasksStore } = await import('@/stores/tasks')
    await useTasksStore.getState().addTask(vaultFs, v.title, {
      list: v.list ?? undefined,
      priority: v.priority,
      due: v.due,
      tags: v.tags,
      repeat: v.repeat,
      repeatWeekday: v.repeatWeekday,
    })
    return {}
  },
}

export default [task]
