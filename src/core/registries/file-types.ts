import type { ComponentType, Ref } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { FileSystemAdapter } from '@/lib/fs/types'

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

/** How a type looks wherever a file is listed. */
export interface FileTypeAppearance {
  /** Icon in the vault tree (and anywhere else that shows a small file glyph). */
  icon: LucideIcon
  /** Tree icon colour, e.g. `text-red-400/70`. Omit for the neutral default. */
  treeClass?: string
  /**
   * Styling in the Files view. Types without one fall back to a generic file
   * icon there.
   */
  browser?: {
    icon: LucideIcon
    iconClass: string
    /** Tile background in grid view. */
    bgClass: string
    /** Offered as a type filter in the Files view, at this position. */
    filter?: { label: string; order: number }
    /** Also style list-view rows (default true; the grid is always styled). */
    inList?: boolean
  }
}

type ThemePair = { dark: string; light: string }

export type GraphShape =
  | 'circle'
  | 'rounded-rect'
  | 'rect'
  | 'pentagon'
  | 'hexagon'
  | 'wide-rounded-rect'
  | 'diamond'

/** Presence means files of this type appear as graph nodes. */
export interface GraphAppearance {
  shape: GraphShape
  colors: { fill: ThemePair; hover: ThemePair; stroke: ThemePair }
  /** Inner SVG markup (24×24 viewBox) drawn inside the node when zoomed in. */
  iconSvg: string
  /** Label in the graph header's node counts, e.g. "3 notes", at this position. */
  count: { singular: string; plural: string; order: number }
}

/** Searchable text pulled out of one file. */
export interface SearchExtraction {
  /** Defaults to the file name without its extension. */
  title?: string
  content: string
  tags?: string[]
  /** Raw `[[wiki-link]]` targets in the file, for the link index. */
  links?: string[]
}

/** A file already read by the caller: text, or bytes for binary formats. */
export interface SearchInput<D extends string | Uint8Array = string | Uint8Array> {
  path: string
  data: D
}

/**
 * Pulls searchable text out of a file. Pure: it does no I/O, so it can run in
 * a worker. It is the default export of `modules/<type id>/search.ts`, which
 * the index's extract worker discovers by glob.
 */
export type SearchExtractor<D extends string | Uint8Array = string | Uint8Array> = (
  input: SearchInput<D>,
) => SearchExtraction | null | Promise<SearchExtraction | null>

/** Presence means files of this type are indexed for search. */
export interface SearchSupport {
  /**
   * How the file is read for the extractor (`modules/<id>/search.ts`).
   * Omit to index the file by title only.
   */
  read?: 'text' | 'bytes'
  /** Cheap enough to re-index on every save or rename (text formats). */
  reindexOnSave?: boolean
}

/** Makes a type creatable from the New menu. */
export interface CreateNewSpec {
  /** Menu label, e.g. "Canvas". */
  label: string
  /** File-name stem; the date is appended, e.g. "Drawing 2026-09-28". */
  stem: string
  /** Suffix the new file gets. Must be one of the type's `suffixes`. */
  suffix: string
  menu: { icon: LucideIcon; accentClass: string; order: number }
  /**
   * Select the new file in the tree and add it to recent files. Defaults to
   * true; notes have historically opened without either.
   */
  revealInTree?: boolean
  /** Lazily loaded initial file contents. `title` is the final file stem. */
  content: () => Promise<{
    default: (ctx: { title: string }) => string | Uint8Array | Promise<string | Uint8Array>
  }>
}

/** What a converter receives: one file's bytes and a way to store images it pulls out. */
export interface ConvertInput {
  data: Uint8Array
  /** The source file's name without its extension. */
  title: string
  /** Saves an extracted image and returns its vault-relative path. */
  saveAsset: (fileName: string, data: Uint8Array) => Promise<string>
}

export interface ConvertOutput {
  content: string
  /** Suffix of the file the content is written to: `.md` or `.slides.md`. */
  suffix: string
  /** Something the user should know about the conversion, e.g. what was left out. */
  warning?: string
}

/** Turns a file of this type into an editable one, written next to the original. */
export interface ConvertSpec {
  /** Button and menu label, e.g. "Convert to Markdown". */
  label: string
  /** Lazily loaded converter. Loaded only when the user converts a file. */
  run: () => Promise<{ default: (input: ConvertInput) => Promise<ConvertOutput> }>
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
  appearance: FileTypeAppearance
  graph?: GraphAppearance
  search?: SearchSupport
  createNew?: CreateNewSpec
  convertTo?: ConvertSpec
  /** Thumbnail for the Files view. */
  thumbnail?: {
    /** Lazily loaded renderer returning an object URL, or null. */
    load: () => Promise<{
      default: (fs: FileSystemAdapter, path: string) => Promise<string | null>
    }>
    /** Also shown in list-view rows (default false; grid tiles always show it). */
    inList?: boolean
    /** Frame around the grid-view thumbnail (page-shaped for PDFs, square for images). */
    gridFrameClass: string
  }
  /** Show the extension in titles (code files: `a.ts` vs `a.py`). */
  keepExtensionInTitle?: boolean
  /** Double-clicking the file in the tree starts an inline rename. */
  renameOnDoubleClick?: boolean
  /**
   * Can be the target of a `[[wiki-link]]`: offered in link autocomplete,
   * resolved by name, and scanned for backlinks. Markdown-family formats.
   */
  linkable?: boolean
  /**
   * Open the file in a tab after importing it on its own. `true` for every
   * suffix, or a list of the suffixes that should.
   */
  openAfterImport?: boolean | readonly string[]
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
  /** The registered suffix `path` matched (lower-case), e.g. `.slides.md`. */
  matchedSuffix(path: string): string | undefined
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

  function matchedSuffix(path: string): string | undefined {
    const name = basename(path)
    for (const suffix of suffixes) {
      if (name.endsWith(suffix)) return suffix
    }
    // A dot-less name equal to an extension ("md", "pdf") resolved to that type
    // under the old `split('.').pop()` lookup. Kept for parity.
    if (!name.includes('.') && bySuffix.has(`.${name}`)) return `.${name}`
    return undefined
  }

  function resolve(path: string): FileTypeDefinition | undefined {
    const suffix = matchedSuffix(path)
    return suffix === undefined ? undefined : bySuffix.get(suffix)
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
    matchedSuffix,
    detect,
  }
}
