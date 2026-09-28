import { GitFork } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

const view: ViewDefinition = {
  id: 'graph',
  label: 'Graph',
  icon: GitFork,
  component: () =>
    import('@/components/views/graph-view').then((m) => ({
      default: m.GraphView as ViewComponent,
    })),
  // Opened from inside the vault, so it keeps the Vault nav item lit.
  highlights: 'vault',
}

export default view
