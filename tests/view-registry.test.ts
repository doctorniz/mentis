// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { File } from 'lucide-react'
import { createViewRegistry, type ViewDefinition } from '@/core/registries/views'
import { views } from '@/core/registries'
import { useVaultStore } from '@/stores/vault'
import { DEFAULT_CHAT_SETTINGS } from '@/types/chat'
import { DEFAULT_VAULT_CONFIG } from '@/types/vault'

// Resolution never loads the component.
const component = () => Promise.reject(new Error('not loaded in tests'))

const vault: ViewDefinition = {
  id: 'vault',
  label: 'Vault',
  icon: File,
  component,
  nav: { order: 1 },
  shortcut: '1',
  aliases: [{ id: 'notes' }, { id: 'search', highlight: false }],
}
const organizer: ViewDefinition = {
  id: 'organizer',
  label: 'Organizer',
  icon: File,
  component,
  nav: { order: 0 },
  shortcut: '3',
  aliases: [{ id: 'tasks', props: { initialTab: 'tasks' } }],
}
const graph: ViewDefinition = {
  id: 'graph',
  label: 'Graph',
  icon: File,
  component,
  highlights: 'vault',
}

describe('createViewRegistry', () => {
  const registry = createViewRegistry([vault, organizer, graph])

  it('orders nav entries and leaves out views without nav', () => {
    expect(registry.nav().map((v) => v.id)).toEqual(['organizer', 'vault'])
  })

  it('resolves a view id to itself with no props', () => {
    expect(registry.resolve('vault')).toEqual({ def: vault, props: {}, highlight: 'vault' })
  })

  it('resolves aliases to their view, props and highlight', () => {
    expect(registry.resolve('notes')).toMatchObject({ def: vault, highlight: 'vault' })
    expect(registry.resolve('tasks')).toMatchObject({
      def: organizer,
      props: { initialTab: 'tasks' },
      highlight: 'organizer',
    })
    expect(registry.resolve('search')).toMatchObject({ def: vault, highlight: undefined })
  })

  it('highlights the named nav item for views outside the nav', () => {
    expect(registry.resolve('graph')?.highlight).toBe('vault')
  })

  it('returns undefined for unknown ids', () => {
    expect(registry.resolve('nope')).toBeUndefined()
  })

  it('looks up views by shortcut', () => {
    expect(registry.byShortcut('3')?.id).toBe('organizer')
    expect(registry.byShortcut('9')).toBeUndefined()
  })

  it('rejects duplicate ids, colliding aliases and shared shortcuts', () => {
    expect(() => createViewRegistry([vault, vault])).toThrow(/registered twice/)
    expect(() => createViewRegistry([vault, { ...graph, aliases: [{ id: 'notes' }] }])).toThrow(
      /collides/,
    )
    expect(() => createViewRegistry([vault, { ...graph, aliases: [{ id: 'vault' }] }])).toThrow(
      /collides/,
    )
    expect(() => createViewRegistry([vault, { ...organizer, shortcut: '1' }])).toThrow(/Ctrl\+1/)
  })
})

describe('createViewRegistry with enabled', () => {
  let on = false
  const gated: ViewDefinition = {
    id: 'vault-chat',
    label: 'Chat',
    icon: File,
    component,
    nav: { order: 2 },
    shortcut: '2',
    aliases: [{ id: 'bookmarks' }],
    enabled: () => on,
  }
  const registry = createViewRegistry([vault, gated], { config: () => null })

  it('hides a disabled view from every way in', () => {
    on = false
    expect(registry.nav().map((v) => v.id)).toEqual(['vault'])
    expect(registry.all().map((v) => v.id)).toEqual(['vault'])
    expect(registry.get('vault-chat')).toBeUndefined()
    expect(registry.byShortcut('2')).toBeUndefined()
    expect(registry.resolve('vault-chat')).toBeUndefined()
    expect(registry.resolve('bookmarks')).toBeUndefined()
  })

  it('shows it again the moment it is enabled', () => {
    on = true
    expect(registry.nav().map((v) => v.id)).toEqual(['vault', 'vault-chat'])
    expect(registry.byShortcut('2')?.id).toBe('vault-chat')
    expect(registry.resolve('bookmarks')?.def.id).toBe('vault-chat')
  })
})

describe('registered views', () => {
  beforeEach(() => {
    useVaultStore
      .getState()
      .setConfig({ ...DEFAULT_VAULT_CONFIG, chat: { ...DEFAULT_CHAT_SETTINGS, enabled: true } })
  })

  it('leave Chat out until it is switched on, and keep the other shortcuts', () => {
    useVaultStore.getState().setConfig({ ...DEFAULT_VAULT_CONFIG })
    expect(views.nav().map((v) => v.id)).toEqual(['calendar', 'tasks', 'board', 'bookmarks'])
    expect(views.byShortcut('2')).toBeUndefined()
    expect(views.byShortcut('3')?.id).toBe('calendar')
    expect(views.resolve('vault-chat')).toBeUndefined()
  })

  it('list Chat, Calendar, Tasks, Thoughts and Bookmarks in the sidebar once on', () => {
    expect(views.nav().map((v) => [v.id, v.label])).toEqual([
      ['vault-chat', 'Chat'],
      ['calendar', 'Calendar'],
      ['tasks', 'Tasks'],
      ['board', 'Thoughts'],
      ['bookmarks', 'Bookmarks'],
    ])
  })

  it('bind Ctrl+1 to 6 in sidebar order, Today first', () => {
    expect(['1', '2', '3', '4', '5', '6'].map((k) => views.byShortcut(k)?.id)).toEqual([
      'journal',
      'vault-chat',
      'calendar',
      'tasks',
      'board',
      'bookmarks',
    ])
  })

  it('route every legacy id the old router handled', () => {
    const route = (id: string) => {
      const r = views.resolve(id)
      return [r?.def.id, r?.props, r?.highlight]
    }
    expect(route('file-browser')).toEqual(['vault', {}, undefined])
    expect(route('notes')).toEqual(['vault', {}, undefined])
    expect(route('search')).toEqual(['vault', {}, undefined])
    expect(route('graph')).toEqual(['graph', {}, 'vault'])
    expect(route('organizer')).toEqual(['tasks', {}, 'tasks'])
    expect(route('calendar')).toEqual(['calendar', {}, 'calendar'])
  })
})
