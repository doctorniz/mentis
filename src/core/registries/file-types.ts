import type { ComponentType, Ref } from 'react'

/**
 * File-type registry.
 *
 * Every file type the app understands is described by one `FileTypeDefinition`,
 * contributed by a module under `src/modules/<type>/register.ts`. Consumers ask
 * the registry instead of switching on extensions, so adding a type means adding
 * a module and nothing else.
 *
 * Registrations are loaded eagerly, so a definition must stay cheap: metadata plus
 * `() => import(...)` loaders. Anything heavy (editors, parsers, extractors) lives
 * behind those loaders.
 */

export interface FileTypeClaim {
  /** Id of the type whose files this type may take over after a content check. */
  baseType: string
  /**
   * Returns true when `text` (the file's full contents) belongs to this type.
   * May be async so heavy parsing can sit behind a dynamic import. A test that
   * throws or rejects counts as false.
   */
  test: (text: string) => boolean | Promise<boolean>
}

/** Imperative handle an editor may expose to the host. */
export interface FileEditorHandle {
  /** Documents that store their chat id themselves (markdown frontmatter). */
  ensureChatAssetId?: () => string
}

/** Everything the host hands to a module's editor. */
export interface FileEditorProps {
  tabId: string
  path: string
  /** Freshly created: the editor may focus its title for an immediate rename. */
  isNew?: boolean
  /** Vault structure changed (rename, create) — the tree must refresh. */
  refreshTree: () => void
  /** The file was saved — backlinks, graph and search must refresh. */
  notifySaved: () => void
  /** Rename on disk to `stem` + `ext`; the host retargets the tab. */
  renameFile: (tabId: string, oldPath: string, stem: string, ext: string) => void
  /** Open another vault file in a tab. */
  openFile: (path: string) => void
  /** Vault paths a document may link to (wiki-link autocomplete). */
  linkTargets: string[]
  /** Reports a live editor instance so host panels (the outline) can read it. */
  onEditorReady?: (editor: unknown) => void
  /** Reports the chat id read from disk (see FileEditorHandle.ensureChatAssetId). */
  onChatAssetIdFromDisk?: (path: string, chatAssetId: string) => void
  handleRef?: Ref<FileEditorHandle>
}

export type FileEditorLoader = () => Promise<{ default: ComponentType<FileEditorProps> }>

export interface FileTypeLayout {
  /** Show the host's right column (chat, and optionally outline + backlinks). */
  rightColumn?: {
    storageKey: string
    defaultRightPx: number
    minRightPx: number
    outline?: boolean
    backlinks?: boolean
  }
  /**
   * Where per-document chat finds its asset id: `editor` asks the editor handle
   * (id lives in the file), `index` uses the path-keyed chat index.
   */
  chat?: 'editor' | 'index'
  /** Responsive behaviour: `canvas` and `wide` editors collapse surrounding chrome sooner. */
  narrow?: 'canvas' | 'wide'
}

export interface FileTypeDefinition {
  /** Stable id. Stored in editor tabs; used as the key everywhere else. */
  id: string
  /** Human-readable name, e.g. "Spreadsheet". */
  label: string
  /**
   * Lower-case filename suffixes including the leading dot, e.g. `.slides.md`.
   * Compound suffixes are fine — the longest match wins.
   */
  suffixes: readonly string[]
  /**
   * Content-based takeover of another type's files (e.g. a markdown file whose
   * frontmatter says it is a kanban board). Only consulted by `detect`.
   */
  claims?: FileTypeClaim
  /** Lazily loaded editor/viewer. Loaded only when a file of this type opens. */
  editor?: FileEditorLoader
  layout?: FileTypeLayout
}

export interface FileTypeRegistry {
  /** All definitions, in registration order. */
  all(): readonly FileTypeDefinition[]
  /** Definition by id, or undefined. */
  get(id: string): FileTypeDefinition | undefined
  /**
   * Resolve by filename alone. Checks compound suffixes before shorter ones, so
   * `deck.slides.md` resolves to the `.slides.md` type rather than `.md`.
   * Returns undefined for unknown files.
   */
  resolve(path: string): FileTypeDefinition | undefined
  /**
   * `resolve`, then — only if some other type claims files of the resolved type —
   * read the contents and let the claim decide. `fallback` names the type to
   * assume when the path does not resolve (unknown files open as markdown).
   */
  detect(
    path: string,
    readText: (path: string) => Promise<string>,
    options?: { fallback?: string },
  ): Promise<FileTypeDefinition | undefined>
}

function basename(path: string): string {
  const i = path.lastIndexOf('/')
  return (i >= 0 ? path.slice(i + 1) : path).toLowerCase()
}

export function createFileTypeRegistry(
  definitions: readonly FileTypeDefinition[],
): FileTypeRegistry {
  const byId = new Map<string, FileTypeDefinition>()
  const bySuffix = new Map<string, FileTypeDefinition>()

  for (const def of definitions) {
    if (byId.has(def.id)) throw new Error(`File type "${def.id}" is registered twice`)
    byId.set(def.id, def)
    for (const raw of def.suffixes) {
      const suffix = raw.toLowerCase()
      if (!suffix.startsWith('.')) {
        throw new Error(`File type "${def.id}": suffix "${raw}" must start with "."`)
      }
      const owner = bySuffix.get(suffix)
      if (owner) {
        throw new Error(`Suffix "${suffix}" is claimed by both "${owner.id}" and "${def.id}"`)
      }
      bySuffix.set(suffix, def)
    }
  }

  // Longest first, so compound suffixes are checked before their last segment.
  const suffixes = [...bySuffix.keys()].sort((a, b) => b.length - a.length)

  function resolve(path: string): FileTypeDefinition | undefined {
    const name = basename(path)
    for (const suffix of suffixes) {
      if (name.endsWith(suffix)) return bySuffix.get(suffix)
    }
    // A dot-less name equal to an extension ("md", "pdf") resolved to that type
    // under the old `split('.').pop()` lookup. Kept for parity.
    if (!name.includes('.')) return bySuffix.get(`.${name}`)
    return undefined
  }

  async function detect(
    path: string,
    readText: (path: string) => Promise<string>,
    options?: { fallback?: string },
  ): Promise<FileTypeDefinition | undefined> {
    const base = resolve(path) ?? (options?.fallback ? byId.get(options.fallback) : undefined)
    if (!base) return undefined
    const claimants = definitions.filter((d) => d.claims?.baseType === base.id)
    if (claimants.length === 0) return base
    let text: string
    try {
      text = await readText(path)
    } catch {
      return base
    }
    for (const claimant of claimants) {
      try {
        if (await claimant.claims!.test(text)) return claimant
      } catch {
        // Unparseable content keeps the suffix type.
      }
    }
    return base
  }

  return {
    all: () => definitions,
    get: (id) => byId.get(id),
    resolve,
    detect,
  }
}
