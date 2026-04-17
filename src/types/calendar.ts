export type CalendarEventColor =
  | 'violet'
  | 'sky'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'slate'

export const EVENT_COLORS: { value: CalendarEventColor; label: string; bg: string; text: string }[] = [
  { value: 'violet', label: 'Violet',  bg: 'bg-violet-500/20',  text: 'text-violet-700 dark:text-violet-300' },
  { value: 'sky',    label: 'Sky',     bg: 'bg-sky-500/20',     text: 'text-sky-700 dark:text-sky-300' },
  { value: 'emerald',label: 'Emerald', bg: 'bg-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-300' },
  { value: 'amber',  label: 'Amber',   bg: 'bg-amber-500/20',   text: 'text-amber-700 dark:text-amber-300' },
  { value: 'rose',   label: 'Rose',    bg: 'bg-rose-500/20',    text: 'text-rose-700 dark:text-rose-300' },
  { value: 'slate',  label: 'Slate',   bg: 'bg-slate-500/20',   text: 'text-slate-700 dark:text-slate-300' },
]

export const EVENT_COLOR_DOT: Record<CalendarEventColor, string> = {
  violet:  'bg-violet-500',
  sky:     'bg-sky-500',
  emerald: 'bg-emerald-500',
  amber:   'bg-amber-500',
  rose:    'bg-rose-500',
  slate:   'bg-slate-500',
}

export interface CalendarEventFrontmatter {
  uid: string
  /** ISO-8601 date string (YYYY-MM-DD) or datetime (YYYY-MM-DDTHH:mm) */
  start: string
  /** ISO-8601 date or datetime; same as start for all-day single events */
  end: string
  allDay: boolean
  color: CalendarEventColor
  created: string
  modified: string
  [key: string]: unknown
}

export interface CalendarEvent {
  path: string
  uid: string
  title: string
  /** Notes / description body (markdown without H1) */
  body: string
  start: string
  end: string
  allDay: boolean
  color: CalendarEventColor
  created: string
  modified: string
}
