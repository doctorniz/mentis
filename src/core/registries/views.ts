import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * View registry.
 *
 * Every full-screen surface (Vault, Board, Chat, …) is described by one
 * `ViewDefinition`, contributed by a module under `src/modules/<name>/view.ts`.
 * The router, the nav (desktop sidebar and mobile menu), the Ctrl+digit
 * shortcuts and the shortcuts dialog all read from here, so adding a view means
 * adding a module and nothing else.
 *
 * Like file types, definitions are loaded eagerly and must stay cheap: the view
 * itself sits behind the `component` loader.
 */

export type ViewComponent = ComponentType<Record<string, unknown>>

export interface ViewAlias {
  /** An old id that still routes to this view (saved state, deep links). */
  id: string
  /** Props the view renders with when reached through this alias. */
  props?: Record<string, unknown>
  /** Highlight the view's nav item while the alias is active (default true). */
  highlight?: boolean
}

export interface ViewDefinition {
  id: string
  label: string
  icon: LucideIcon
  /** Lazily loaded view. Loaded when first shown, or preloaded when idle. */
  component: () => Promise<{ default: ViewComponent }>
  /** Show in the nav, at this position; `shortcut` is the Ctrl+<digit>. */
  nav?: { order: number; shortcut?: string }
  /** For views outside the nav: the nav item to highlight while shown. */
  highlights?: string
  aliases?: readonly ViewAlias[]
}

export interface ResolvedView {
  def: ViewDefinition
  props: Record<string, unknown>
  /** Id of the nav item to highlight, if any. */
  highlight: string | undefined
}

export interface ViewRegistry {
  all(): readonly ViewDefinition[]
  get(id: string): ViewDefinition | undefined
  /** Nav entries in order. */
  nav(): readonly ViewDefinition[]
  /** Resolve an id or alias to the view to render, its props and nav highlight. */
  resolve(id: string): ResolvedView | undefined
  /** The view bound to Ctrl+<key>, if any. */
  byShortcut(key: string): ViewDefinition | undefined
}

export function createViewRegistry(definitions: readonly ViewDefinition[]): ViewRegistry {
  const byId = new Map<string, ViewDefinition>()
  const aliases = new Map<string, { def: ViewDefinition; alias: ViewAlias }>()
  const shortcuts = new Map<string, ViewDefinition>()

  for (const def of definitions) {
    if (byId.has(def.id) || aliases.has(def.id)) {
      throw new Error(`View id "${def.id}" is registered twice`)
    }
    byId.set(def.id, def)
    const key = def.nav?.shortcut
    if (key) {
      const owner = shortcuts.get(key)
      if (owner) throw new Error(`Shortcut Ctrl+${key} is claimed by "${owner.id}" and "${def.id}"`)
      shortcuts.set(key, def)
    }
  }
  for (const def of definitions) {
    for (const alias of def.aliases ?? []) {
      if (byId.has(alias.id) || aliases.has(alias.id)) {
        throw new Error(`View alias "${alias.id}" collides with another view or alias`)
      }
      aliases.set(alias.id, { def, alias })
    }
  }

  const navOrder = definitions.filter((d) => d.nav).sort((a, b) => a.nav!.order - b.nav!.order)

  const highlightOf = (def: ViewDefinition) => (def.nav ? def.id : def.highlights)

  return {
    all: () => definitions,
    get: (id) => byId.get(id),
    nav: () => navOrder,
    byShortcut: (key) => shortcuts.get(key),
    resolve(id) {
      const def = byId.get(id)
      if (def) return { def, props: {}, highlight: highlightOf(def) }
      const hit = aliases.get(id)
      if (!hit) return undefined
      return {
        def: hit.def,
        props: hit.alias.props ?? {},
        highlight: hit.alias.highlight === false ? undefined : highlightOf(hit.def),
      }
    },
  }
}
