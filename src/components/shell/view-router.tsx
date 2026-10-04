import { Suspense, useEffect } from 'react'
import { useUiStore } from '@/stores/ui'
import { views, HOME_VIEW } from '@/core/registries'
import { lazyViewFor, preloadViewsWhenIdle } from '@/core/registries/lazy-view'

/**
 * Renders the active view. Views, their legacy aliases (with any props they
 * pass) and the fallback all come from the view registry; unknown ids show the
 * vault, as they always have.
 */
export function ViewRouter() {
  const activeView = useUiStore((s) => s.activeView)

  useEffect(() => preloadViewsWhenIdle(), [])

  const resolved = views.resolve(activeView) ?? views.resolve(HOME_VIEW)
  if (!resolved) return null
  const View = lazyViewFor(resolved.def)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <View {...resolved.props} />
      </Suspense>
    </div>
  )
}
