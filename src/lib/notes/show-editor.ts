import { views } from '@/core/registries'
import { useUiStore } from '@/stores/ui'

/**
 * Files open in the vault view. The sidebar's tree and search sit beside every
 * view, so opening a file from them switches to the vault view when another
 * view is showing.
 */
export function showEditor(): void {
  const ui = useUiStore.getState()
  if (views.resolve(ui.activeView)?.def.id !== 'vault') ui.setActiveView('vault')
}
