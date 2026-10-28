/**
 * A note was rewritten from outside its editor (a task ticked in the Tasks
 * view, a reminder's Done). An open editor with nothing unsaved reloads it.
 */
export const NOTE_WRITTEN_EVENT = 'ink:note-written'

export function announceNoteWritten(path: string): void {
  window.dispatchEvent(new CustomEvent(NOTE_WRITTEN_EVENT, { detail: { path } }))
}
