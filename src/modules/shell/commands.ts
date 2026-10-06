import {
  Keyboard,
  LogOut,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  Settings,
  Sparkles,
  Sun,
} from 'lucide-react'
import type { AnyCommand } from '@/core/registries/commands'
import { HOME_VIEW } from '@/core/registries/views'
import { useUiStore } from '@/stores/ui'

/** App-wide actions. The shortcuts shown are bound in `app-shell.tsx`. */
const commands: AnyCommand[] = [
  {
    id: 'shell.search',
    title: 'Search the vault',
    keywords: ['find', 'full text'],
    icon: Search,
    shortcut: 'Ctrl+F',
    scope: 'global',
    run: () => {
      useUiStore.getState().setActiveView(HOME_VIEW)
      window.dispatchEvent(new CustomEvent('ink:vault-search-open'))
    },
  },
  {
    id: 'shell.settings',
    title: 'Open settings',
    keywords: ['preferences', 'options', 'config'],
    icon: Settings,
    shortcut: 'Ctrl+,',
    scope: 'global',
    run: (ctx) => ctx.openSettings(),
  },
  {
    id: 'shell.settings-ai',
    title: 'AI settings',
    keywords: ['chat', 'provider', 'model', 'api key', 'llm'],
    icon: Sparkles,
    scope: 'global',
    run: (ctx) => ctx.openSettings('ai'),
  },
  {
    id: 'shell.toggle-sidebar',
    title: 'Toggle sidebar',
    keywords: ['hide', 'show', 'nav'],
    icon: PanelLeft,
    shortcut: 'Ctrl+\\',
    scope: 'global',
    run: () => useUiStore.getState().toggleSidebar(),
  },
  {
    id: 'shell.shortcuts',
    title: 'Keyboard shortcuts',
    keywords: ['keys', 'hotkeys', 'help'],
    icon: Keyboard,
    shortcut: 'Ctrl+Shift+?',
    scope: 'global',
    run: (ctx) => ctx.openShortcuts(),
  },
  {
    id: 'shell.theme-light',
    title: 'Theme: light',
    keywords: ['appearance', 'mode'],
    icon: Sun,
    scope: 'global',
    run: () => useUiStore.getState().setTheme('light'),
  },
  {
    id: 'shell.theme-dark',
    title: 'Theme: dark',
    keywords: ['appearance', 'mode', 'night'],
    icon: Moon,
    scope: 'global',
    run: () => useUiStore.getState().setTheme('dark'),
  },
  {
    id: 'shell.theme-system',
    title: 'Theme: match system',
    keywords: ['appearance', 'mode', 'auto'],
    icon: Monitor,
    scope: 'global',
    run: () => useUiStore.getState().setTheme('system'),
  },
  {
    id: 'shell.close-vault',
    title: 'Close vault',
    keywords: ['switch vault', 'exit'],
    icon: LogOut,
    scope: 'global',
    run: (ctx) => ctx.closeVault(),
  },
]

export default commands
