/**
 * Drawing with a pen on a touch screen: which pointers draw, and the pen's
 * eraser. Shared by the canvas and PDF ink.
 *
 * "Draw with" is per device (a phone without a pen has no use for it), kept
 * in this browser:
 * - `auto` — fingers draw until a pen is used; from then on, for the rest of
 *   the session, fingers only scroll and zoom (a resting palm draws nothing).
 * - `pen` — only a pen (or a mouse) draws.
 * - `any` — everything draws.
 */

export type DrawWith = 'auto' | 'pen' | 'any'

const KEY = 'mentis.drawWith'
let penSeen = false

export function getDrawWith(): DrawWith {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'pen' || v === 'any' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function setDrawWith(value: DrawWith): void {
  try {
    if (value === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, value)
  } catch {
    /* not kept: back to automatic next time */
  }
}

/** Note a pointer going down: a pen turns automatic mode to pen-only for the session. */
export function notePointer(pointerType: string): void {
  if (pointerType === 'pen') penSeen = true
}

/** Whether a finger draws, or only scrolls and zooms. */
export function fingersDraw(): boolean {
  const mode = getDrawWith()
  return mode === 'any' || (mode === 'auto' && !penSeen)
}

/** The pen's eraser end (or eraser button): button 5, or bit 32 of `buttons`. */
export function isPenEraser(e: { pointerType: string; button: number; buttons: number }): boolean {
  return e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0)
}
