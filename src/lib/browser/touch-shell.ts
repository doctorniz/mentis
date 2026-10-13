import { isTauri } from '@/lib/fs/platform'
import { useUiStore } from '@/stores/ui'

/**
 * Touch-screen behaviour for the whole app, loaded only on touch screens:
 *
 * - Swiping down from the top of a dialog or sheet closes it.
 * - In the Android app, the back button closes what is open (a dialog, a
 *   sheet, a menu), then steps back through the views visited, then sends the
 *   app to the background rather than closing it.
 *
 * Returns a function that undoes it all.
 */
export function startTouchShell(): () => void {
  const stops = [startSwipeToClose(), trackViewHistory()]
  if (isTauri() && __MENTIS_MOBILE__) stops.push(startBackButton())
  // Marks the page once swipes are handled (the end-to-end tests wait for it).
  document.documentElement.dataset.touchShell = ''
  return () => {
    stops.forEach((stop) => stop())
    delete document.documentElement.dataset.touchShell
  }
}

/** Open layers (dialogs, sheets, menus), which Escape closes. */
const OPEN_LAYERS =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [data-radix-popper-content-wrapper]'

/** Close the top open layer, as Escape does. False if nothing was open. */
function closeTopLayer(): boolean {
  if (!document.querySelector(OPEN_LAYERS)) return false
  const target = document.activeElement ?? document.body
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  return true
}

/** How far down from a dialog's top a swipe may start: its header. */
const GRAB_ZONE = 56
const CLOSE_DISTANCE = 90

function startSwipeToClose(): () => void {
  let drag: { el: HTMLElement; x: number; y: number; dy: number } | null = null

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    const el = (e.target as Element | null)?.closest<HTMLElement>(
      '[role="dialog"], [role="alertdialog"]',
    )
    const t = e.touches[0]!
    if (!el || t.clientY - el.getBoundingClientRect().top > GRAB_ZONE) return
    drag = { el, x: t.clientX, y: t.clientY, dy: 0 }
  }
  const onMove = (e: TouchEvent) => {
    if (!drag) return
    const t = e.touches[0]!
    const dy = t.clientY - drag.y
    if (dy <= 0 || Math.abs(t.clientX - drag.x) > dy) {
      drag.el.style.marginTop = ''
      drag.dy = 0
      return
    }
    drag.dy = dy
    drag.el.style.marginTop = `${dy}px`
  }
  const onEnd = () => {
    if (!drag) return
    const { el, dy } = drag
    drag = null
    el.style.marginTop = ''
    if (dy >= CLOSE_DISTANCE) closeTopLayer()
  }

  document.addEventListener('touchstart', onStart, { passive: true })
  document.addEventListener('touchmove', onMove, { passive: true })
  document.addEventListener('touchend', onEnd)
  document.addEventListener('touchcancel', onEnd)
  return () => {
    document.removeEventListener('touchstart', onStart)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
    document.removeEventListener('touchcancel', onEnd)
  }
}

/** The views visited, most recent last, for the back button. */
const visited: string[] = []
let steppingBack = false

function trackViewHistory(): () => void {
  return useUiStore.subscribe((s, prev) => {
    if (s.activeView === prev.activeView || steppingBack) return
    visited.push(prev.activeView)
    if (visited.length > 30) visited.shift()
  })
}

/** Step back one view. False if there is nowhere to go back to. */
export function stepBack(): boolean {
  const previous = visited.pop()
  if (!previous) return false
  steppingBack = true
  try {
    useUiStore.getState().setActiveView(previous as never)
  } finally {
    steppingBack = false
  }
  return true
}

function startBackButton(): () => void {
  let unregister: (() => void) | null = null
  let stopped = false
  void import('@tauri-apps/api/app').then(async ({ onBackButtonPress }) => {
    const listener = await onBackButtonPress(() => {
      if (closeTopLayer() || stepBack()) return
      void import('@tauri-apps/api/core').then(({ invoke }) => invoke('app_to_background'))
    })
    if (stopped) void listener.unregister()
    else unregister = () => void listener.unregister()
  })
  return () => {
    stopped = true
    unregister?.()
  }
}
