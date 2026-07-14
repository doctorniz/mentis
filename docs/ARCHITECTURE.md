# Mentis — Architecture

Local-first, offline-capable PWA for notes, PDFs, drawings, and personal organization. Every document is a plain file the user owns; the vault directory **is** the database. Licensed under **BSL 1.1** (see [§10](#10-license--development-practices)).

This document is the human-readable orientation. Deep operational detail (module-by-module behavior, invariants, gotchas) lives in the root [`CLAUDE.md`](../CLAUDE.md), which is kept current with the code.

## 1. High-Level Overview

```
┌──────────────────────────────────────────────────────────┐
│  Presentation — React components + Zustand stores        │
│  (views, editors, panels; one store per domain)          │
├──────────────────────────────────────────────────────────┤
│  Business logic — src/lib/* (framework-free)             │
│  markdown · pdf · canvas · search · sync · chat · …      │
├──────────────────────────────────────────────────────────┤
│  Platform — FileSystemAdapter                            │
│  OpfsAdapter · FsapiAdapter · ScopedAdapter              │
└──────────────────────────────────────────────────────────┘
```

- **Next.js App Router**, but the app is a single-page shell: `app/page.tsx` renders `AppRoot`, and navigation is state-driven (`useUiStore.activeView` → `ViewRouter`). `pnpm build` produces a static export (`output: 'export'`); there is no server.
- **No database.** All persistence is files in the vault plus a few IndexedDB side-channels (OAuth tokens, LLM API keys, FSAPI directory handles, sync manifest) that never contain document content.
- **All file I/O goes through `FileSystemAdapter`** (`src/lib/fs/`). Components never call browser storage APIs directly.

## 2. Views & Editors

Navigation: **Chat** `Ctrl+0` · **Vault** `Ctrl+1` · **Board** `Ctrl+2` · **Organizer** (Tasks/Calendar) `Ctrl+3` · **Bookmarks** `Ctrl+4` · **Files** `Ctrl+5`. Graph and Search open from inside Vault. Below 768px (`MOBILE_NAV_MEDIA_QUERY`) the sidebar becomes a masthead + sheet, and every view-level sub-sidebar collapses into a shared `MobileDrawer`.

| Surface | What it is | Key tech |
| --- | --- | --- |
| **Vault** | File tree + editor panes; the primary workspace. Left column swaps between tree and search panel (`vault-left-search.tsx`). | — |
| **Markdown editor** | WYSIWYG with Source toggle, wiki-links, slash commands, tables, KaTeX, find/replace, outline, image resize, kanban rendering for `type: kanban` notes. | Tiptap/ProseMirror, CodeMirror (source) |
| **PDF editor** | View + annotate (highlight/ink/text/comment/sign), page operations, forms, find-in-document. Writes are destructive into the PDF bytes — see [§4](#4-destructive-pdf-write-model). | PDF.js, Fabric.js, pdf-lib |
| **Canvas** | Raster-first layered drawing surface with selection tool, clipped painting, dirty-region undo — see [§5](#5-canvas-model). | PixiJS v8 (WebGL) |
| **Mindmap** | `.mind` node-graph outlining with auto-layout and cycle guards. | @xyflow/react |
| **Spreadsheet** | `.xlsx`/`.xls`/`.csv` grid editing, multi-sheet, format-preserving save. | jspreadsheet-ce, SheetJS |
| **DOCX** | `.docx` editing with responsive zoom. | @eigenpal/docx-js-editor |
| **PPTX** | `.pptx` viewer/editor with ribbon UI. | slidecanvas |
| **Code files** | Source/plain-text editing with lazy per-language highlighting. | CodeMirror 6 |
| **Images / audio** | Raster edit pipeline (rotate/crop/adjust) for PNG/JPEG/WebP; audio player + MP3 recording + Whisper transcription. | Canvas 2D, mp3-mediarecorder, transformers.js |
| **Board** | Quick-capture thought cards (text, image, voice) in `_marrow/_board/`; "Move to Vault" exports to native file types. | minimal Tiptap |
| **Tasks / Calendar** | CalDAV-shaped tasks (VTODO frontmatter, quick-add parser, recurrence) and an event calendar (day/week/month), both as `.md` files under `_marrow/`. | — |
| **Bookmarks** | Web bookmarks with OG-metadata scraping, categories as folders. | — |
| **Graph** | Force-directed wiki-link graph across every file type, distinct node shape per type. | Canvas 2D |
| **Chat** | Two BYO-LLM surfaces: per-document chat (grounded in the open file) and whole-vault chat (`Ctrl+0`, MiniSearch RAG). Six providers incl. fully-local Gemma via WebGPU. | provider SSE clients, MediaPipe |

## 3. Vault File Structure

```
my-vault/
├── _marrow/                 # App metadata — hidden from the note tree
│   ├── config.json          # Vault settings (name, autosave, sync, chat, …)
│   ├── search-index.json    # Rebuilt on vault open; excluded from sync
│   ├── snapshots/           # Pre-edit PDF backups; excluded from sync
│   ├── signatures/          # Saved signature images
│   ├── templates/           # Note templates
│   ├── _drawings/<assetId>/ # Canvas pixel PNGs, one folder per .canvas
│   ├── _chats/<assetId>/    # Chat thread JSON sidecars (+ index.json for PDFs)
│   ├── _board/              # Board thoughts (+ _assets/)
│   ├── _bookmarks/<category>/
│   ├── _tasks/<list>/
│   ├── _calendar/
│   └── _dailies/            # Daily notes (configurable)
├── _inbox/                  # Import landing zone — visible in the UI
├── **/_assets/              # Per-folder assets — shown inline in notes
└── …                        # User folders and files
```

Hidden-from-tree rules live in `lib/notes/tree-filter.ts`. The **Files** view (`Ctrl+5`) shows everything, including `_marrow`, as a power-user raw view. Settings → Vault → Maintenance can reap orphaned canvas pixel data (deleted canvases/layers, v4 migration leftovers); `_marrow/snapshots/` is deliberately not reaped.

## 4. Destructive PDF Write Model

1. **Open** — PDF.js renders pages; existing annotations hydrate as editable Fabric objects (`fromLoader: true` so hydration isn't "unsaved").
2. **First edit** — the current bytes are snapshotted to `_marrow/snapshots/<name>_<timestamp>.pdf`.
3. **Persist** — on autosave (`VaultConfig.autoSave`, default 5s + optional blur; no Save button), pdf-lib rewrites the file: highlights/ink/text boxes/stamps are drawn into page **content**; text comments become native `/Text` annotations tagged `InkMarrow` for idempotent re-saves. The viewer then reloads bytes so the raster layer matches disk.
4. **Undo** — `PdfUndoStack` keeps up to 20 pre-operation byte snapshots for page operations.

Write safety: temp-file + rename, `%PDF-` header verification, snapshot retention pruning (`maxPerFile`, `retentionDays`) on vault open.

## 5. Canvas Model

`.canvas` v5 = a small metadata JSON (layers, viewport, stable `assetId`) plus one PNG per layer under `_marrow/_drawings/<assetId>/`. Saves write PNGs first, JSON last, so a crash never leaves the JSON pointing at unwritten pixels. Renaming the `.canvas` does **not** move the folder — the `assetId` travels with the JSON. v2–v4 files migrate on first save.

Runtime: each layer is a `RenderTexture` shown by a `Sprite` in a pan/zoom viewport `Container`. Brush strokes render into a scratchpad RT (stroke opacity lives on the scratchpad sprite — Photoshop opacity-vs-flow) and commit on pointerup; the eraser stamps directly into the layer with `erase` blend. Undo is PNG-blob snapshots, **dirty-region scoped** where the region is knowable. A rectangular **selection** persists across tool switches and constrains brush/eraser/fill; moves float the pixels on an overlay sprite and commit at pointerup so autosave never sees a half-moved layer.

The full lifecycle invariants (ticker teardown order, unmount flush → destroy sequencing, `pendingCanvasSaves` hand-off, Pixi v8 texture/extract gotchas) are documented in `CLAUDE.md` → "Canvas Lifecycle" and "Key Gotchas" — read those before touching canvas code.

## 6. Search

MiniSearch index built on vault open, persisted to `_marrow/search-index.json`. Indexed content: markdown title/body/tags, PDF text (PDF.js), PPTX slide text and DOCX body text (JSZip + Open-XML regex), spreadsheet cells, mindmap labels, kanban cards, code/plain-text bodies (14k-char cap), canvas titles. Cheap text types (markdown, kanban, mindmap, code) reindex incrementally on save/rename; binary types re-extract on vault open or manual rebuild. The live search UI is the Vault left-column panel; vault chat's RAG runs over the same index.

## 7. Sync (optional, Dropbox)

OAuth 2 PKCE, Full-Dropbox scope, absolute remote paths (`/Apps/Mentis/<vault>`). Tokens in IndexedDB keyed by vault. `SyncManager` runs `fullSync` on vault open, `pushFile` after saves, delta `pull` on a poll interval; change detection via SHA-256 manifest (IndexedDB).

- **Excludes** (`lib/sync/excludes.ts`): `_marrow/snapshots` and `search-index.json` are invisible to sync in both directions; per-vault extras via `sync.excludePaths` in config.json.
- **Conflicts** (`lib/sync/conflicts.ts`): pure last-write-wins policy shared by full sync and the delta path. True conflicts (both sides changed) surface a toast naming the kept version. The delta path also refuses to clobber unpushed local edits and re-uploads a locally-edited file on remote delete.

Setup and header requirements: [`CLOUD_SYNC.md`](./CLOUD_SYNC.md) and [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## 8. State Management

Zustand + Immer, one store per domain: `vault`, `editor`, `file-tree`, `file-browser`, `pdf`, `canvas`, `board`, `tasks`, `calendar`, `bookmarks`, `search`, `chat` (per-document), `vault-chat`, `ui`, `toast`. Stores hold view/session state only — documents live on disk. No `Set`/`Map` inside stores (Immer `enableMapSet` is not enabled); use `Record` or arrays.

Contexts: `VaultFsContext` (active adapter + config), `NotesWorkspaceContext` (wiki-link paths), `SyncContext` (sync status + push).

## 9. Performance & Security

Performance: lazy file-tree loading and virtualized lists; PDF pages render lazily via a worker; canvas pixels stay on the GPU with dirty-region undo; heavy editors (`slidecanvas`, DOCX, jspreadsheet, language packs) are dynamic imports so the base bundle stays lean; Service Worker caches the shell (cache-first for hashed assets, stale-while-revalidate otherwise).

Security:

| Concern | Mitigation |
| --- | --- |
| FS access scope | FSAPI needs a user gesture; OPFS is origin-sandboxed. `navigator.storage.persist()` on vault open. |
| File integrity | PDF temp-write + header check; canvas PNGs-first/JSON-last; chat/index writes temp+rename. |
| Secrets | LLM API keys live only in IndexedDB (`mentis-llm-keys`), never in `config.json`, never synced. OAuth tokens likewise per-vault in IndexedDB. |
| Unsaved changes | `beforeunload` guard over dirty tabs; editors flush on unmount. |
| Crashes | `ErrorBoundary` wraps the shell with a recovery UI. |
| Headers | COOP/COEP required for `SharedArrayBuffer` (PDF.js) must be set by the host — static export can't set them (see `DEPLOYMENT.md`). |

## 10. License & development practices

| Topic | Detail |
| --- | --- |
| **Source license** | **Business Source License 1.1** — see root [`LICENSE`](../LICENSE). Not an OSI open-source license until the **Change Date** (2030-04-09), after which MPL 2.0 applies per the license text. |
| **Parameters** | Licensor: Marrow Group. Licensed Work: Mentis (this repo). Additional Use Grant: production use for any purpose (see `LICENSE`). |
| **`package.json`** | `"license": "SEE LICENSE IN LICENSE"`. |
| **AI-assisted development** | Built with AI-assisted tooling; maintainers review changes. This notice does not narrow the BSL; third parties remain responsible for their own compliance and review. |

Related: [`TECH_STACK.md`](./TECH_STACK.md) · [`CONVENTIONS.md`](./CONVENTIONS.md) · [`LAUNCH_DEFERRALS.md`](./LAUNCH_DEFERRALS.md) · [`PDF_WORKFLOW.md`](./PDF_WORKFLOW.md) · [`RISKS.md`](./RISKS.md)
