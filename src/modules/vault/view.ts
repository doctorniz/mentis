import { Vault } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

const view: ViewDefinition = {
  id: 'vault',
  label: 'Vault',
  icon: Vault,
  component: () =>
    import('@/components/views/vault-view').then((m) => ({
      default: m.VaultView as ViewComponent,
    })),
  nav: { order: 1, shortcut: '1' },
  aliases: [
    // Legacy ids that always rendered the vault.
    { id: 'file-browser' },
    { id: 'notes' },
    // Search moved into the vault's left column. The old nav never highlighted
    // Vault for it, so it still doesn't.
    { id: 'search', highlight: false },
  ],
}

export default view
