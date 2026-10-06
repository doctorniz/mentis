import { Lightbulb } from 'lucide-react'
import type { CaptureDestination, ParseResult } from '@/core/registries/capture'
import { useBoardStore } from '@/stores/board'

/** Thoughts keep the input exactly as typed: no parsing, so nothing to get wrong. */
const asIs = (input: string): ParseResult => ({
  values: { body: input },
  matchedSpans: [],
  residual: input,
})

/**
 * The default destination. Commits instantly with no confirmation and no
 * network: one file in `_mentis/_thoughts/`, undoable for a few seconds.
 */
const thought: CaptureDestination = {
  id: 'thought',
  sigil: '/thought',
  aliases: ['/idea'],
  label: 'Thought',
  icon: Lightbulb,
  hint: 'Anything on your mind',
  immediate: true,
  parseNow: asIs,
  parse: async (input) => asIs(input),
  write: async (values, { vaultFs }) => {
    const text = String(values.body ?? '').trim()
    if (!text) return null
    const board = useBoardStore.getState()
    const item = await board.captureThought(vaultFs, text)
    window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    return {
      message: 'Saved to Thoughts',
      undo: async () => {
        await useBoardStore.getState().removeItem(vaultFs, item.path)
        window.dispatchEvent(new CustomEvent('ink:vault-changed'))
      },
    }
  },
}

export default [thought]
