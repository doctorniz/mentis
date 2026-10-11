/**
 * A reminder's Open: the item to show once its view is up. The view may not
 * be mounted yet when Open is clicked, so the request waits here until the
 * view takes it, and an event tells a mounted view to look.
 */

export const OPEN_REMINDER_EVENT = 'ink:open-reminder'

let pending: { kind: 'task' | 'event'; path: string } | null = null

export function requestOpen(kind: 'task' | 'event', path: string): void {
  pending = { kind, path }
  window.dispatchEvent(new CustomEvent(OPEN_REMINDER_EVENT))
}

/** What kind of item is waiting to be opened, without taking it. */
export function pendingOpenKind(): 'task' | 'event' | null {
  return pending?.kind ?? null
}

/**
 * The path waiting to be opened by a view showing `kind`, taken once — but
 * only when `has(path)`, so a view whose items are still loading takes it later.
 */
export function takeOpen(kind: 'task' | 'event', has: (path: string) => boolean): string | null {
  if (pending?.kind !== kind || !has(pending.path)) return null
  const { path } = pending
  pending = null
  return path
}
