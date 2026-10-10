import { formatLocalDate } from '@/lib/tasks/recurrence'

export interface TemplateContext {
  /** When the note is created (or the template inserted). */
  date: Date
  /** The note's title. */
  title: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Fill a template's variables: `{{date}}` (2026-10-12), `{{weekday}}`
 * (Monday), `{{time}}` (14:32) and `{{title}}`. Spaces inside the braces are
 * allowed; anything else in braces is left exactly as written.
 */
export function fillTemplate(text: string, { date, title }: TemplateContext): string {
  const values: Record<string, string> = {
    date: formatLocalDate(date),
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    title,
  }
  return text.replace(/\{\{\s*(date|weekday|time|title)\s*\}\}/g, (_, key: string) => values[key]!)
}
