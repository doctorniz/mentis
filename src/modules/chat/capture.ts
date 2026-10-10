import { MessageSquare } from 'lucide-react'
import type { CaptureDestination, ParseResult } from '@/core/registries/capture'
import { useUiStore } from '@/stores/ui'

const asIs = (input: string): ParseResult => ({
  values: { prompt: input },
  matchedSpans: [],
  residual: input,
})

/**
 * Ask the vault. No dialog and no file: the input becomes the first message
 * of a new vault chat — the one destination that navigates away. If chat is
 * not set up, the message waits in the chat box rather than being lost.
 */
const chat: CaptureDestination = {
  id: 'chat',
  sigil: '/chat',
  aliases: ['/ask'],
  label: 'Chat',
  icon: MessageSquare,
  hint: 'What did I decide about the kitchen?',
  immediate: true,
  parseNow: asIs,
  parse: async (input) => asIs(input),
  async write(values) {
    const prompt = String(values.prompt ?? '').trim()
    if (!prompt) return null
    const { useVaultChatStore } = await import('@/stores/vault-chat')
    useVaultChatStore.getState().setPendingPrompt(prompt)
    useUiStore.getState().setActiveView('vault-chat')
    return {}
  },
}

export default [chat]
