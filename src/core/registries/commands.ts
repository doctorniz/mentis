import type { LucideIcon } from 'lucide-react'
import type { FileSystemAdapter } from '@/lib/fs/types'

/**
 * Command registry.
 *
 * A command is something the user can run by name: from the command palette,
 * and for editor commands from the editor's slash menu. Modules contribute
 * them from `src/modules/<name>/commands.ts`; core adds one per view and one
 * per creatable file type.
 *
 * Each command belongs to a scope, which names the context it runs with.
 * Core declares `global`; a module declares its own by merging into
 * `CommandScopes`, so core never depends on, say, the editor's types:
 *
 *     declare module '@/core/registries/commands' {
 *       interface CommandScopes { 'markdown-editor': { editor: Editor; range: Range } }
 *     }
 *
 * A scope other than `global` is available only while something provides its
 * context (see `provideCommandContext`) — an editor with focus, for example.
 */

/** What the app shell lets every global command do. */
export interface GlobalCommandContext {
  vaultFs: FileSystemAdapter
  /** Create a file of this registered type in the default folder and open it. */
  createFile: (fileTypeId: string) => Promise<void>
  /** Open a vault file in the editor. */
  openFile: (path: string) => void
  /** Open settings, on this tab (a tab label in lower case). */
  openSettings: (tab?: string) => void
  openShortcuts: () => void
  closeVault: () => void
}

export interface CommandScopes {
  global: GlobalCommandContext
}

export type CommandScope = keyof CommandScopes

export interface CommandDefinition<S extends CommandScope = CommandScope> {
  /** Unique across all commands. */
  id: string
  title: string
  description?: string
  /** Extra words the command is found by. */
  keywords?: readonly string[]
  icon?: LucideIcon
  /** Shown beside the command, e.g. `Ctrl+,`. Display only: binding the key is the owner's job. */
  shortcut?: string
  scope: S
  run: (ctx: CommandScopes[S]) => void | Promise<void>
}

/** A command of any scope, with `run` still tied to its own scope's context. */
export type AnyCommand = { [S in CommandScope]: CommandDefinition<S> }[CommandScope]

export interface CommandRegistry {
  all(): readonly AnyCommand[]
  /** A scope's commands in registration order, optionally filtered by `query`. */
  inScope<S extends CommandScope>(scope: S, query?: string): CommandDefinition<S>[]
}

/** Case-insensitive substring match on title, description and keywords. */
export function matchesCommand(command: AnyCommand, query: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  return (
    command.title.toLowerCase().includes(q) ||
    (command.description?.toLowerCase().includes(q) ?? false) ||
    (command.keywords ?? []).some((k) => k.toLowerCase().includes(q))
  )
}

export function createCommandRegistry(commands: readonly AnyCommand[]): CommandRegistry {
  const seen = new Set<string>()
  for (const c of commands) {
    if (seen.has(c.id)) throw new Error(`Command "${c.id}" is registered twice`)
    seen.add(c.id)
  }
  return {
    all: () => commands,
    inScope: <S extends CommandScope>(scope: S, query = '') =>
      commands.filter(
        (c): c is Extract<AnyCommand, { scope: S }> =>
          c.scope === scope && matchesCommand(c, query),
      ) as unknown as CommandDefinition<S>[],
  }
}

/* Contexts for scopes other than global, provided while they exist. */

type ContextProvider<S extends CommandScope> = () => CommandScopes[S] | null

const providers = new Map<CommandScope, Set<ContextProvider<CommandScope>>>()

/**
 * Make a scope's context available while the returned function has not been
 * called. `current` answers at the moment of asking — null when the context
 * does not apply right now (the editor exists but has no focus).
 */
export function provideCommandContext<S extends Exclude<CommandScope, 'global'>>(
  scope: S,
  current: ContextProvider<S>,
): () => void {
  const set = providers.get(scope) ?? new Set()
  set.add(current as ContextProvider<CommandScope>)
  providers.set(scope, set)
  return () => {
    set.delete(current as ContextProvider<CommandScope>)
  }
}

/** Every non-global scope that has a context right now, with that context. */
export function currentCommandContexts(): Partial<CommandScopes> {
  const found: Partial<Record<CommandScope, unknown>> = {}
  for (const [scope, set] of providers) {
    for (const current of set) {
      const ctx = current()
      if (ctx) {
        found[scope] = ctx
        break
      }
    }
  }
  return found as Partial<CommandScopes>
}
