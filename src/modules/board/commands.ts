import { Lightbulb, Mic } from 'lucide-react'
import type { AnyCommand } from '@/core/registries/commands'
import { useBoardStore } from '@/stores/board'
import { useUiStore } from '@/stores/ui'

/** The Board entries of the New menu, as commands. */
const commands: AnyCommand[] = [
  {
    id: 'board.new-thought',
    title: 'New thought',
    keywords: ['board', 'capture', 'idea', 'card'],
    icon: Lightbulb,
    scope: 'global',
    run: async ({ vaultFs }) => {
      await useBoardStore.getState().addThought(vaultFs)
      useUiStore.getState().setActiveView('board')
      window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    },
  },
  {
    id: 'board.record',
    title: 'Record a voice thought',
    keywords: ['board', 'audio', 'microphone', 'recording'],
    icon: Mic,
    scope: 'global',
    run: () => {
      useUiStore.getState().setActiveView('board')
      // The board listens for this once it is shown.
      setTimeout(() => window.dispatchEvent(new CustomEvent('ink:board-start-recording')), 100)
    },
  },
]

export default commands
