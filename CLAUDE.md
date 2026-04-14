# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Next.js dev server (Turbopack)
pnpm dev:webpack      # Fallback if Turbopack fails
pnpm build            # Static export SPA
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm typecheck        # TypeScript type check
pnpm test             # Vitest (all tests)
pnpm test:ui          # Vitest UI
pnpm test:e2e         # Playwright E2E
```

To run a single test file: `pnpm test tests/search.test.ts`

**Requirements:** Node.js 20+, pnpm 9.15.0. Use `pnpm`, never `npm` or `yarn`.

## Architecture

**Mentis by Marrow** is a local-first, offline-capable PWA for note-taking. Every note is a file the user owns — markdown (`.md`), PDF, or canvas (`.canvas` JSON). There is no database; the vault directory *is* the data store.

### Layer Overview

```
Components + Stores  ←→  lib/ (business logic)  ←→  FileSystemAdapter
```

- **`src/components/`** — React UI, organized by domain (`notes/`, `pdf/`, `canvas/`, `board/`, `shell/`, `views/`, `file-browser/`, `graph/`, `search/`, `ui/`)
- **`src/stores/`** — Zustand + Immer stores, one per domain (`vault`, `editor`, `pdf`, `canvas`, `board`, `search`, `file-tree`, `file-browser`, `ui`, `toast`)
- **`src/lib/`** — Framework-free business logic: `fs/`, `vault/`, `editor/`, `markdown/`, `pdf/`, `search/`, `canvas/`, `board/`, `graph/`, `snapshot/`, `sync/`
- **`src/types/`** — TypeScript type definitions
- **`src/contexts/`** — `VaultFsContext` (active adapter + config), `NotesWorkspaceContext` (wiki-link paths)

### File System Abstraction

All file I/O goes through `FileSystemAdapter` (`src/lib/fs/`). Never call browser storage APIs directly.

- **`OpfsAdapter`** — Origin Private File System (all browsers, fallback)
- **`FsapiAdapter`** — File System Access API via `showDirectoryPicker()` (Chromium only)
- **`ScopedAdapter`** — wraps another adapter with a root path prefix; `vaultFs` is always scoped to vault root

Access via `useVaultFsContext()` which exposes both `rootFs` (vault discovery) and `vaultFs` (scoped to active vault).

### Vault Structure

```
my-vault/
├── _marrow/          # App metadata — hidden from file tree
│   ├── config.json
│   ├── search-index.json
│   ├── snapshots/    # Pre-edit PDF backups
│   ├── signatures/
│   └── templates/
├── _inbox/           # PDF import zone — visible in UI
├── _board/           # Board thoughts — hidden from tree/browser/search
│   └── _assets/      # Board image attachments
└── **/_assets/       # Per-folder assets — hidden; shown inline in notes
```

### State Management

Zustand + Immer throughout. Pattern:

```typescript
const useMyStore = create<MyState>()(
  immer((set, get) => ({
    value: null,
    setValue: (v) => set((state) => { state.value = v })
  }))
)
```

**Do not use `Set` or `Map` in Zustand/Immer stores** unless `enableMapSet()` is called. Use `Record<string, true>` or arrays instead.

### Three Editors

**Markdown** — Tiptap (ProseMirror). Wiki-links `[[note]]` are inline nodes. Slash commands via Suggestion plugin. KaTeX for math. Auto-save debounced ~750ms via `useAutoSave`.

**PDF** — PDF.js renders pages to `<canvas>`; Fabric.js overlay handles annotations. Annotations are written destructively into PDF bytes via `pdf-lib` (no sidecar). `PdfUndoStack` stores up to 20 pre-operation raw PDF byte snapshots. On first edit, a snapshot is created in `_marrow/snapshots/`.

**Canvas** — Fabric.js infinite surface (`.canvas` JSON). Tools: select/pan, draw, text, image, erase. Legacy sticky notes and connectors render but are not creatable via new UI.

### Board

Quick-capture notice board (`Ctrl+4`). **Thoughts** are `.md` files in `_board/` with frontmatter (`type`, `color`, timestamps). Title from first `# H1`. Masonry CSS-columns layout. Inline edit via minimal Tiptap (bold/italic/underline/lists — keyboard shortcuts only). Image thoughts in `_board/_assets/`. `useBoardStore` for CRUD; `lib/board/index.ts` parse/serialize; `lib/editor/board-extensions.ts` extensions. Future item types (bookmark, list, reminder, task, audio) share `_board/` differentiated by `type` frontmatter.

### Routing / Views

Next.js App Router, but the app is a single-page shell. Navigation is state-driven via `useUiStore` (`activeView`). The `app/page.tsx` renders `<AppRoot>` which switches between views (notes, PDF, canvas, graph, board, browse, search, new).

### Search

MiniSearch index built on vault open, stored in `_marrow/search-index.json`. Incrementally updated on save/rename. Supports fuzzy matching, `#tag` filters, date range, folder prefix, file type filters.

### Sync (optional)

Providers: **Dropbox** (OAuth 2 PKCE; Full Dropbox scoped; absolute paths like `/Apps/Mentis/<vault>`). OAuth return `src/app/auth/dropbox/`. Tokens in IndexedDB keyed per vault path. Settings → Sync configures Dropbox; the Vault toolbar shows a **sync-now** control when `sync.provider === 'dropbox'`. Sync runs only for the open vault’s `config.sync`. Change detection via SHA-256 manifest. Conflict resolution: last-write-wins by `modifiedAt`.

## Conventions

**Imports:** Always use `@/` alias, never relative paths crossing directory boundaries. External → internal → types ordering.

**Naming:**
- Components: `PascalCase.tsx`
- Hooks: `use-kebab-case.ts`
- Lib/stores/types: `kebab-case.ts`
- Constants: `SCREAMING_SNAKE_CASE`

**Styling:** Tailwind CSS utility classes + `cn()` helper (`clsx` + `tailwind-merge`). No CSS modules. Dark mode via `.dark` class on `<html>`. Tailwind v4 (no `tailwind.config` file — configured via `postcss.config.mjs` and CSS `@theme` tokens in `globals.css`).

**UI primitives:** Radix UI for dialogs, dropdowns, tooltips. Lucide for icons. Never nest interactive elements.

**Errors:** File system ops use try/catch. User-facing errors via `toast.error()`. Always also `console.error()` for dev debugging.

## Testing

- Default Vitest environment is `node`, not jsdom
- Use `@vitest-environment happy-dom` docblock for component tests that need DOM
- **Never use jsdom** — canvas bindings fail on Windows (no Cairo) and most CI

Tests live in `tests/`. Key suites: `search.test.ts`, `markdown.test.ts`, `pdf-annotation-writer.test.ts`, `fs-adapter.test.ts`, `graph.test.ts`, `canvas-undo.test.ts`.

## Key Gotchas

- **Rename + auto-save race:** After a file rename, the auto-save cleanup closes over the *old* path. Skip flush if `pathRef.current !== path` to avoid recreating the old file.
- **COOP/COEP headers** are required for `SharedArrayBuffer` (PDF.js). They must be set at the hosting layer, not in `next.config.ts` (static export doesn't run Next.js middleware). See `docs/DEPLOYMENT.md`.
- **Canvas tool mode:** After async `.canvas` load, re-apply tool mode to all Fabric objects so toolbar state matches.
- **PDF.js loading:** Use the loader in `src/lib/pdf/pdfjs-loader.ts` — do not import PDF.js directly, as it requires careful worker setup.
- **Static export:** `pnpm build` uses `output: 'export'`. No server-side rendering, no API routes (except auth pages which are handled client-side).
