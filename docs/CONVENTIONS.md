# Mentis — Code Conventions

## License

| Item | Detail |
|---|---|
| **Full text** | Root [`LICENSE`](../LICENSE) — **Business Source License 1.1** (MariaDB-style parameters + terms). |
| **Licensor / work** | **Marrow Group** / **Mentis** (this repository). |
| **Additional Use Grant** | Production use for **any purpose** (see `LICENSE` — adjust only with legal review). |
| **Change Date / Change License** | **2030-04-09** / **MPL 2.0** (edit in `LICENSE` if policy changes). |
| **`package.json`** | `"license": "SEE LICENSE IN LICENSE"`. |
| **README** | **AI assistance** section — tooling disclosure; **License** section — pointer to BSL; neither replaces `LICENSE`. |
| **Docs** | [`ARCHITECTURE.md`](./ARCHITECTURE.md) §10, [`TECH_STACK.md`](./TECH_STACK.md) (footer), [`PRD.md`](./PRD.md) §6, [`DEPLOYMENT.md`](./DEPLOYMENT.md) (static hosting / headers), this file, [`CURSOR.md`](./CURSOR.md). |

Third-party npm packages remain under their respective licenses.

## Project Structure

```
ink-marrow/
├── docs/                       # Project documentation (10 markdown files)
├── tests/                      # Vitest unit tests (261 tests, default env node; happy-dom per file where needed)
│   ├── assets.test.ts          # static asset paths / PWA entries
│   ├── canvas-undo.test.ts     # canvas undo stack behaviour
│   ├── canvas.test.ts          # createEmptyCanvas, serialize/deserialize, nodes/edges
│   ├── daily-note.test.ts      # daily note path + openOrCreate helpers
│   ├── download-file.test.ts   # download helper
│   ├── editor-tab-from-path.test.ts
│   ├── export-pdf.test.ts      # print/export HTML helpers
│   ├── file-utils.test.ts      # getFileType, isHiddenPath, Result helpers
│   ├── folder-ops.test.ts      # renameFolder, collectFilePaths
│   ├── fs-adapter.test.ts      # InMemoryAdapter contract
│   ├── graph.test.ts           # wiki graph build/resolve
│   ├── image-edit-pipeline.test.ts # vault image rotate/adjust/crop helpers
│   ├── markdown-bridge.test.ts # Tiptap ↔ MD (happy-dom)
│   ├── markdown.test.ts        # parseNote, wiki-links, tags, resolveWikiLinkPath
│   ├── pdf-annotation-writer.test.ts # writeAnnotationsIntoPdf /Text + strip
│   ├── pdf-operations.test.ts  # createBlankPdf, page ops, forms helpers
│   ├── pdf-search-text.test.ts # in-PDF text search helper
│   ├── pdf-store-colors.test.ts # pdf store colour keys
│   ├── search.test.ts          # parseSearchQuery, buildSnippet, index, filters
│   ├── snapshot.test.ts        # snapshot helpers
│   └── toast.test.ts           # toast store
├── public/                     # PWA: manifest.json, icon.svg, sw.js
├── src/
│   ├── app/                    # Next.js App Router (single route, client-side views)
│   │   ├── layout.tsx          # Root layout (PWA meta, SW registration)
│   │   ├── page.tsx            # Home → AppRoot
│   │   └── globals.css         # Tailwind v4 @theme tokens, light/dark palettes, ProseMirror styles
│   │
│   ├── components/
│   │   ├── shell/              # AppShell, MainSidebar, ViewRouter, KeyboardShortcutsDialog, ErrorBoundary, NewFilePopover, SettingsDialog
│   │   ├── views/              # VaultView, SearchView, GraphView, NewView (+ NotesView/FileBrowserView as vault sub-panes)
│   │   ├── notes/              # MarkdownNoteEditor, file tree, tabs, toolbar, slash/wiki, backlinks, rename
│   │   ├── pdf/                # PdfViewer, toolbar, outline, per-page Fabric canvas, page panel, signature pad, form dialog
│   │   ├── canvas/             # CanvasEditor + CanvasToolbar (Fabric.js: draw, text, sticky, connect, frames, wiki-links, export)
│   │   ├── graph/              # GraphCanvas (force-directed Canvas 2D renderer)
│   │   ├── file-browser/       # FbFileCard/Row, context menu, batch bar, import zone
│   │   ├── search/             # VaultSearchBootstrap
│   │   └── ui/                 # Button, Toaster (shared primitives)
│   │
│   ├── contexts/               # React context providers
│   │   ├── vault-fs-context.tsx     # Vault FS adapters, path, config
│   │   └── notes-workspace-context.tsx  # Markdown paths for wiki-link + backlinks
│   │
│   ├── hooks/                  # Reusable React hooks
│   │   ├── use-auto-save.ts         # Debounced auto-save for editors
│   │   └── use-keyboard-shortcuts.ts # Global keyboard shortcut registration
│   │
│   ├── lib/                    # Core business logic (non-React)
│   │   ├── fs/                 # FileSystemAdapter interface, OpfsAdapter, FsapiAdapter, scoped adapter
│   │   ├── vault/              # Vault lifecycle (create, discover, config, session)
│   │   ├── editor/             # Tiptap extensions, slash/wiki, markdown ↔ JSON bridge, vault-image, pdf-embed
│   │   ├── markdown/           # gray-matter parsing, wiki-link/tag extraction
│   │   ├── notes/              # Tree filtering, new-note paths, daily-note, folder-ops, assets, export-pdf, template store, backlinks
│   │   ├── pdf/                # pdfjs-loader, annotation R/W, page ops, signatures, thumbnails
│   │   ├── search/             # MiniSearch index, build, query, snippets, parse-query
│   │   ├── canvas/             # Canvas JSON serialization (nodes, edges, frames), undo-stack
│   │   ├── graph/              # Graph data model: build-graph (nodes from notes, edges from wiki-links, folder filter)
│   │   ├── file-browser/       # File collection, sort, filter helpers
│   │   ├── snapshot/           # PDF snapshot management
│   │   └── keyboard-shortcuts.ts  # Global shortcut definitions + formatter
│   │
│   ├── stores/                 # Zustand + Immer stores
│   │   ├── vault.ts            # Active vault session
│   │   ├── ui.ts               # View mode, sidebar, theme
│   │   ├── file-tree.ts        # File tree, selection, starred
│   │   ├── editor.ts           # Tabs, active tab, recent files
│   │   ├── pdf.ts              # PDF state, annotations, tools
│   │   ├── canvas.ts           # Canvas state, tools, dirty flag
│   │   ├── search.ts           # Search query, results, filters
│   │   ├── file-browser.ts     # Browser view mode, sort, multi-select
│   │   └── toast.ts            # Toast notifications (info/success/error/warning)
│   │
│   ├── types/                  # Shared TypeScript types
│   │   ├── vault.ts            # VaultConfig, ViewMode, well-known dirs
│   │   ├── files.ts            # FileEntry, FileType, FileStats
│   │   ├── editor.ts           # EditorTab, NoteFrontmatter
│   │   ├── pdf.ts              # Annotations, tools, signatures
│   │   ├── canvas.ts           # CanvasFile, nodes, edges, frames
│   │   ├── search.ts           # SearchResult, SearchFilters, SearchIndexDocument
│   │   └── file-browser.ts     # FbViewMode, FbFileItem, sorts/filters
│   │
│   └── utils/                  # cn.ts (clsx + tailwind-merge)
│
├── .cursor/rules/              # Cursor AI rules (.mdc files)
├── next.config.ts              # Static export; canvas stub alias; hosting headers → docs/DEPLOYMENT.md
├── postcss.config.mjs          # @tailwindcss/postcss (no tailwind.config file — v4)
├── tsconfig.json               # strict, ES2022, @/* paths
├── .npmrc                      # pnpm hoist-pattern for Turbopack
├── package.json                # Dependencies and scripts
├── pnpm-lock.yaml
└── README.md
```

## Naming Conventions

### Files & Directories

| Type | Convention | Example |
|---|---|---|
| React components | PascalCase | `FileTreeSidebar.tsx` |
| Hooks | camelCase with `use` prefix | `useVaultStore.ts` |
| Utilities/lib | kebab-case | `pdf-annotations.ts` |
| Types | kebab-case | `vault-types.ts` |
| Stores | kebab-case | `file-tree.ts` |
| Tests | `*.test.ts` / `*.test.tsx` | `vault.test.ts` |
| Constants | SCREAMING_SNAKE_CASE in file | `MAX_SNAPSHOT_COUNT` |

### Code

| Type | Convention | Example |
|---|---|---|
| Components | PascalCase | `FileTreeSidebar` |
| Functions | camelCase | `createVault()` |
| Variables | camelCase | `searchResults` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_SNAPSHOTS_PER_FILE` |
| Types/Interfaces | PascalCase | `VaultConfig`, `FileEntry` |
| Enums | PascalCase (members too) | `ViewMode.FileBrowser` |
| Zustand stores | `use[Name]Store` | `useVaultStore` |
| Event handlers | `handle[Event]` or `on[Event]` | `handleFileClick`, `onDrop` |

## Component Patterns

### Accessibility (HTML)

- Never nest interactive elements (`<button>` inside `<button>`, etc.). For tab UIs with a close control, use a focusable `<div role="tab">` (with `tabIndex` and keyboard activation) and keep actions like “close” as separate `<button>`s.

### Notes editor & vault rename

- After a file rename, `MarkdownNoteEditor`’s `useEffect` cleanup still closes over the **previous** `path`. Flushing save with that path **recreates** the old file (duplicate next to the new one). Skip the flush when `pathRef.current !== path` (tab path already retargeted).

### Component File Structure

```tsx
// 1. Imports (external, then internal, then types)
import { useState, useCallback } from 'react'
import { cn } from '@/utils/cn'
import type { FileEntry } from '@/types/vault'

// 2. Types specific to this component
interface FileTreeItemProps {
  entry: FileEntry
  depth: number
  onSelect: (entry: FileEntry) => void
}

// 3. Component definition (named export)
export function FileTreeItem({ entry, depth, onSelect }: FileTreeItemProps) {
  // hooks first
  const [isExpanded, setIsExpanded] = useState(false)

  // handlers
  const handleClick = useCallback(() => {
    onSelect(entry)
  }, [entry, onSelect])

  // render
  return (
    <div className={cn('flex items-center', depth > 0 && 'ml-4')}>
      {/* ... */}
    </div>
  )
}
```

### Zustand Store Pattern

```tsx
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface VaultState {
  path: string | null
  config: VaultConfig | null

  // Actions
  openVault: (path: string) => Promise<void>
  closeVault: () => void
}

export const useVaultStore = create<VaultState>()(
  immer((set, get) => ({
    path: null,
    config: null,

    openVault: async (path) => {
      // ...
      set((state) => {
        state.path = path
      })
    },

    closeVault: () => {
      set((state) => {
        state.path = null
        state.config = null
      })
    },
  }))
)
```

**Immer + collections:** Do not put `Set` or `Map` in Zustand state when using the `immer` middleware unless you call `enableMapSet()` at app init. Prefer `Record<string, true>` (or string arrays) for set-like data—see `file-tree`, `pdf`, and `canvas` stores.

## Import Aliases

```json
{
  "@/*": ["./src/*"]
}
```

Always use `@/` path aliases for imports within `src/`. Never use relative paths that go more than one level up (`../../`).

## Styling Guidelines

- Use Tailwind CSS utility classes as the primary styling method.
- Use `cn()` utility (clsx + tailwind-merge) for conditional and merged classes.
- Use CSS variables in `globals.css` for theme tokens (colors, spacing, radii).
- Component variants defined with `class-variance-authority` (CVA).
- No CSS modules or styled-components.
- Dark mode via Tailwind v4 `@variant dark` (class-based): `.dark` on `<html>` toggles CSS custom properties. Anti-flash inline script in `layout.tsx` reads `localStorage('ink-theme')` before paint. Three-state toggle (Light / System / Dark) in sidebar. `useUiStore.setTheme()` persists choice and syncs the class.
- **Settings / forms:** avoid a second line of explanatory “hint” text under every label unless it prevents a real mistake. AI guidance: `.cursor/rules/ui-copy.mdc`.

## Error Handling

- File system operations are wrapped in try/catch and return `Result<T, Error>` types where possible.
- User-facing errors are shown via toast notifications — import `toast` from `@/stores/toast` and call `toast.error(msg)`, `toast.warning(msg)`, `toast.success(msg)`, or `toast.info(msg)`. The `<Toaster>` component is mounted in `app-root.tsx`.
- Always keep the `console.error` alongside the toast so developers see full stack traces.
- Critical errors (vault corruption, write failures) show modal dialogs with recovery options (`ErrorBoundary`).

## Testing Strategy

| Layer | Tool | Focus |
|---|---|---|
| Unit | Vitest | Pure functions, store logic, adapters |
| Integration | Vitest + Testing Library | Component interactions, store + component |
| E2E | Playwright | Full user flows (create vault, edit note, annotate PDF) |

## Git Conventions

### Branch Names

- `feat/description` — new feature
- `fix/description` — bug fix
- `refactor/description` — code restructuring
- `docs/description` — documentation
- `chore/description` — tooling, deps, config

### Commit Messages

Follow Conventional Commits:

```
type(scope): description

feat(editor): add slash command menu
fix(pdf): prevent annotation loss on interrupted save
refactor(fs): extract common adapter interface
docs(readme): add development setup instructions
```

### PR Conventions

- One feature/fix per PR
- PR description includes summary + test plan
- Screenshots for UI changes
- All CI checks must pass

## Cursor & AI assistant

- Project rules live in **`.cursor/rules/`** (`.mdc` files). See **`docs/CURSOR.md`** for the current list and purpose.
- When using Cursor Agent on this repo, the default expectation is: greet with **Assalamualaikum** on substantive help, and **update `docs/`** (and `README.md` when needed) at the end of runs that change behavior, architecture, or dependencies—then summarize which doc files changed in the final reply.
- For **UX or user-visible behavior** changes, also refresh **`docs/LAUNCH_DEFERRALS.md` → *Manual verification queue* → *To do*** (and move verified rows to **Done**); repeat that checklist in the closeout under **Manual verification** so a human can smoke-test in the app.
