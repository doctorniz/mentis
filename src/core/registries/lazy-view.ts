import { lazy, type LazyExoticComponent } from 'react'
import { views } from '@/core/registries'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

type LazyView = LazyExoticComponent<ViewComponent>

// One lazy wrapper per view for the life of the app, so switching views never
// remounts or re-suspends a view that has already loaded.
const cache = new Map<string, LazyView>()

export function lazyViewFor(def: ViewDefinition): LazyView {
  let component = cache.get(def.id)
  if (!component) {
    component = lazy(def.component)
    cache.set(def.id, component)
  }
  return component
}

/**
 * Fetch every view's chunk while the browser is idle, so switching views stays
 * instant without putting them in the start-up bundle. The active view loads
 * immediately anyway, because the router renders it.
 */
export function preloadViewsWhenIdle(): () => void {
  const run = () => {
    for (const def of views.all()) {
      void def.component().catch(() => {
        // A failed preload is retried by the real render, which surfaces it.
      })
    }
  }
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(run, { timeout: 5_000 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = window.setTimeout(run, 1_000)
  return () => window.clearTimeout(handle)
}
