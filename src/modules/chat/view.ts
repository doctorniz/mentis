import { Sparkles } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

declare module '@/core/registries/views' {
  interface ViewIds {
    'vault-chat': true
  }
}

const view: ViewDefinition = {
  id: 'vault-chat',
  label: 'Chat',
  icon: Sparkles,
  component: () =>
    import('@/components/views/vault-chat-view').then((m) => ({
      default: m.VaultChatView as ViewComponent,
    })),
  nav: { order: 0, shortcut: '0' },
}

export default view
