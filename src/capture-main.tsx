import '@/node-globals'

import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

import '@/globals.css'
import '@/fonts.css'

// Loaded lazily so this entry stays tiny: a second entry that imported the
// overlay statically would make the bundler regroup the code it shares with
// the main app into chunks the main app then loads up front. The overlay
// page loads once, hidden, at launch; the hotkey only shows it.
const CaptureOverlay = lazy(() =>
  import('@/components/shell/capture-overlay').then((m) => ({ default: m.CaptureOverlay })),
)

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

createRoot(container).render(
  <StrictMode>
    <Suspense fallback={null}>
      <CaptureOverlay />
    </Suspense>
  </StrictMode>,
)
