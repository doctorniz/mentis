import type { FocusEvent, MouseEvent } from 'react'

/**
 * Props that select an input's whole text when a click or tap focuses it, so
 * a title like "Untitled" is replaced by typing. The browser places the caret
 * after focus (on mouseup, or when a tap ends), so the selection is made
 * again after that, and only for the click that focused the field: a second
 * click places the caret as usual.
 */
export const selectOnFocus = {
  onFocus(e: FocusEvent<HTMLInputElement>) {
    const el = e.currentTarget
    el.dataset.justFocused = '1'
    el.select()
    window.setTimeout(() => {
      if (document.activeElement === el) el.select()
    }, 0)
  },
  onMouseUp(e: MouseEvent<HTMLInputElement>) {
    const el = e.currentTarget
    if (el.dataset.justFocused !== '1') return
    delete el.dataset.justFocused
    e.preventDefault()
    el.select()
  },
  onBlur(e: FocusEvent<HTMLInputElement>) {
    delete e.currentTarget.dataset.justFocused
  },
}
