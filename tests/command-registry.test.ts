import { describe, expect, it } from 'vitest'
import {
  createCommandRegistry,
  currentCommandContexts,
  matchesCommand,
  provideCommandContext,
  type AnyCommand,
} from '@/core/registries/commands'
import { commands, views, fileTypes } from '@/core/registries'

const global = (id: string, title: string, keywords?: string[]): AnyCommand => ({
  id,
  title,
  keywords,
  scope: 'global',
  run: () => {},
})

describe('createCommandRegistry', () => {
  it('refuses a command id registered twice', () => {
    expect(() => createCommandRegistry([global('a', 'A'), global('a', 'B')])).toThrow(
      'Command "a" is registered twice',
    )
  })

  it('lists a scope in registration order and filters it by query', () => {
    const registry = createCommandRegistry([
      global('b', 'Beta'),
      global('a', 'Alpha', ['first']),
      global('c', 'Gamma'),
    ])
    expect(registry.inScope('global').map((c) => c.id)).toEqual(['b', 'a', 'c'])
    expect(registry.inScope('global', 'FIRST').map((c) => c.id)).toEqual(['a'])
    expect(registry.inScope('markdown-editor')).toEqual([])
  })
})

describe('matchesCommand', () => {
  const c: AnyCommand = { ...global('x', 'Heading 1', ['h1']), description: 'Large section' }
  it('matches title, description and keywords, ignoring case and outer spaces', () => {
    expect(matchesCommand(c, ' head ')).toBe(true)
    expect(matchesCommand(c, 'LARGE')).toBe(true)
    expect(matchesCommand(c, 'h1')).toBe(true)
    expect(matchesCommand(c, 'table')).toBe(false)
    expect(matchesCommand(c, '')).toBe(true)
  })
})

describe('registered commands', () => {
  it('keeps the slash menu items and their order', () => {
    expect(commands.inScope('markdown-editor').map((c) => c.title)).toEqual([
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Paragraph',
      'Bullet list',
      'Numbered list',
      'Task list',
      'Quote',
      'Code block',
      'Divider',
      'Image',
      'Video',
      'Wiki link',
      'Template',
      'Highlight',
      'Table',
      'Math (inline)',
      'Math block',
    ])
  })

  it('offers a Go to command for every nav view and a New command for every creatable type', () => {
    const ids = new Set(commands.all().map((c) => c.id))
    for (const v of views.nav()) expect(ids.has(`view.${v.id}`)).toBe(true)
    for (const def of fileTypes.all()) expect(ids.has(`new.${def.id}`)).toBe(!!def.createNew)
  })

  it('shows each view shortcut beside its command', () => {
    const vault = commands.all().find((c) => c.id === 'view.vault')
    expect(vault?.shortcut).toBe('Ctrl+1')
  })
})

describe('command contexts', () => {
  it('reports a scope only while it is provided and applies', () => {
    let focused = true
    const ctx = { editor: {} as never, range: { from: 1, to: 1 } }
    const stop = provideCommandContext('markdown-editor', () => (focused ? ctx : null))
    expect(currentCommandContexts()['markdown-editor']).toBe(ctx)
    focused = false
    expect(currentCommandContexts()['markdown-editor']).toBeUndefined()
    focused = true
    stop()
    expect(currentCommandContexts()['markdown-editor']).toBeUndefined()
  })
})
