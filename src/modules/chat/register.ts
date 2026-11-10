import { Sparkles } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

/** A chat saved to the vault (`Title.chat.md`), see lib/chat/vault-chat-ui. */
const definition: FileTypeDefinition = {
  id: 'chat',
  label: 'Chat',
  suffixes: ['.chat.md'],
  editor: () => import('./file-viewer'),
  appearance: { icon: Sparkles, treeClass: 'text-violet-500/70' },
  search: { read: 'text', reindexOnSave: true },
  linkable: true,
}

export default definition
