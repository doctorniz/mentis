# Mentis — Architecture as it exists today

**Status:** current-state audit, first written 2026-09-27; measurements refreshed
2026-09-28 after the Next.js → Vite migration. `typecheck`, `lint` and `build` pass.

This document describes the code that is actually in the repository, not the target
architecture. Where today's code conflicts with the five non-negotiable principles in
[`CLAUDE.md`](../CLAUDE.md), §6 says so explicitly and names the file. Anything describing
the Tauri destination belongs in `CLAUDE.md`, not here.

Every number below was measured, not estimated. The commands are in §8 so they can be re-run.

---

## 1. Baseline

|                   |                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Source            | 268 `.ts`/`.tsx` files, **50,880 LOC** under `src/`                                                     |
| Shell             | Vite 7 — a static SPA, no server, no API routes. Two HTML entries: `index.html` and `auth/dropbox.html` |
| Runtime           | React 19, Zustand 5 + Immer, Tailwind 4                                                                 |
| Storage today     | OPFS (default) or File System Access API; **no SQLite, no Tauri**                                       |
| App-data folder   | `_marrow/` (target name is `_mentis/` — not yet renamed)                                                |
| Client components | 110 files carry `'use client'`                                                                          |
| Workers           | **1**, and it is third-party (`src/lib/audio/recorder.ts:118`, the MP3 encoder)                         |
| Tests             | 38 Vitest files in `tests/`, 21 Playwright specs in `tests/e2e/`                                        |
| Eager JS for `/`  | **1,385 KB gzipped** across 11 chunks, against a **200 KB** budget                                      |
| Total emitted JS  | 2,833 KB gzipped across 71 chunks                                                                       |

The adapter interface already anticipates the migration: `FileSystemAdapter.type` is typed
`'opfs' | 'fsapi' | 'tauri' | 'capacitor'` (`src/lib/fs/types.ts:4`). Nothing implements
`'tauri'` yet.

---

## 2. Module structure

`src/` has no `core/` and no `registries/`. Features are spread across three parallel
trees — `components/<domain>/`, `lib/<domain>/`, `stores/<domain>.ts` — with no enforced
boundary between them.

```
src/
├── main.tsx                         entry: mounts <AppRoot> into index.html's #root
├── auth-dropbox-main.tsx            entry for the /auth/dropbox HTML page
├── node-globals.ts                  Buffer + global shims (§6.2 note)
├── components/         27,301 loc    React UI, 19 domain folders
│   ├── views/           4,876        one component per nav destination
│   ├── notes/           6,702        25 files — largest single folder
│   ├── shell/           2,560        app-shell, main-sidebar, settings-dialog (1,255 loc)
│   ├── canvas/          2,742        pdf/ 2,728 · calendar/ 1,177 · file-browser/ 989
│   └── …                            board, bookmarks, chat, graph, kanban, mindmap,
│                                    pptx, tasks, audio, landing, search, ui
├── lib/                14,514 loc    framework-free logic, 22 domain folders
│   ├── canvas/          4,156        engine, layers, stroke, selection, undo
│   ├── editor/          2,119        18 Tiptap extensions
│   ├── chat/            1,585 · notes/ 1,077 · sync/ 972 · pdf/ 971 · search/ 606
│   └── fs/                718        ← the only storage boundary
├── stores/              2,885 loc    16 Zustand stores
├── contexts/              274 loc    3 React contexts
├── hooks/                  56 loc    use-auto-save.ts — the only hook
└── types/               1,183 loc    17 files
```

Two structural observations:

- **`lib/` is not a lower layer than `components/`.** Five files in `lib/editor/` import
  React components out of `components/notes/` (§6.4). The dependency runs both ways.
- **Domain logic leaks upward.** 81 direct `vaultFs.readFile/writeFile/readdir/rename/…`
  calls sit inside 24 React components, bypassing `lib/` entirely. `settings-dialog.tsx`,
  `notes-view.tsx`, `graph-view.tsx` and `new-view.tsx` all do their own file I/O.

---

## 3. Data flow: filesystem → view

### 3.1 The storage boundary

```
OpfsAdapter ─┐
             ├─→ createScopedAdapter(inner, vaultRoot) ─→ vaultFs ─→ features
FsapiAdapter ┘                                           rootFs  ─→ vault discovery
```

`FileSystemAdapter` (`src/lib/fs/types.ts`) is a 16-method interface: read/write bytes and
text, `exists`, `stat`, `mkdir`, `readdir`, `rename`, `copy`, `remove`, `removeDir`, and an
optional `watch` that **no adapter implements**. `ScopedAdapter` (`src/lib/fs/scoped.ts`)
prefixes every path with the vault root and strips that prefix back off `readdir` results
and watch events, so feature code only ever sees vault-relative paths. That part is clean
and is the right shape to hang a Tauri adapter on.

Adapter _selection_, however, is not in the factory:

- `getFileSystemAdapter()` (`src/lib/fs/index.ts:17`) hardcodes `new OpfsAdapter()`.
- `FsapiAdapter` is chosen inside a React component — `src/components/landing/vault-landing.tsx:107`
  and `:184` — with `getFileSystemAdapter()` called at `:75`, `:148`, `:204` for the OPFS path.

So "which filesystem am I on" is decided by the landing screen. This is the first seam the
Tauri migration has to move, and it is small.

### 3.2 Session hand-off

`AppRoot` (`src/components/app-root.tsx`) holds the session in `useState`, not a store.
`VaultLanding` builds a `VaultSessionValue { rootFs, vaultFs, vaultPath, config }` and calls
`onVaultReady`, which fans the same data into `useVaultStore` and mounts:

```
<VaultFsProvider value={session}>      ← context: the adapters
  <SyncProviderBridge>                 ← context: sync status + pushFile
    <AppShell>                         ← chrome + global keybindings
      <VaultSearchBootstrap />         ← full vault walk + parse (§6.3)
      <ViewRouter />                   ← hardcoded switch on activeView
```

39 files call `useVaultSession()` directly to get at `vaultFs`.

### 3.3 View selection

`src/components/shell/view-router.tsx` is a 63-line `switch` on `useUiStore.activeView`
with all eight view components **statically imported**. Three arms are legacy redirects
(`FileBrowser`, `Notes`, `Search` → `VaultView`; `Tasks`/`Calendar` → `OrganizerView`).
This is the file `CLAUDE.md` wants replaced by a Views registry.

### 3.4 File → editor dispatch

Opening a file walks four separate pieces of per-type knowledge:

| Step                      | Location                                      | Shape                                                                  |
| ------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Extension → `FileType` | `src/types/files.ts:39` `getFileType()`       | one `switch` over ~50 extensions, keyed on `filename.split('.').pop()` |
| 2. `FileType` → tab type  | `src/lib/notes/editor-tab-from-path.ts:6`     | second `switch`, 11 arms                                               |
| 3. Content claims        | same file, `detectEditorTabType()`            | a module may claim another type's files by content; none do today (kanban now uses `.kan.md`) |
| 4. Tab type → component   | `src/components/views/notes-view.tsx:604-798` | 12-arm nested ternary                                                  |

The same per-type knowledge is then re-encoded in at least three more places: a 10-deep
nested ternary for tree icons (`src/components/notes/notes-file-tree.tsx:555`), another
switch in `src/components/file-browser/fb-file-card.tsx:95` and `:363`, and `typeFromPath()`
for graph node shapes in `src/lib/graph/build-graph.ts:57`.

Because step 1 reads only the last dot-segment, **the target compound extensions
(`.map.md`, `.kan.md`, `.slides.md`) cannot be expressed today** — they would all resolve to
`markdown`. Kanban already works around this with the step-3 frontmatter peek.

### 3.5 Save path

There is one save mechanism: `useAutoSave` (`src/hooks/use-auto-save.ts`, 56 loc) takes
`{ isDirty, onSave, intervalMs, saveOnBlur }`, runs a `setInterval`, listens for `blur`,
and registers a `beforeunload` guard. Each editor owns its own serialisation and calls
`vaultFs.writeTextFile`/`writeFile` itself, then optionally `reindexFilePath()` and
`window.dispatchEvent(new CustomEvent('ink:vault-changed'))`. That custom event is the
app's de-facto invalidation bus — `notes-view.tsx:484` and the graph view both listen.

Write-safety practices are per-feature rather than shared: canvas writes PNGs-then-JSON,
chat and the chat asset index use temp-file + rename, PDF verifies a `%PDF-` header. There
is no single `writeFileAtomic`.

---

## 4. Where state lives

Six distinct locations, in rough order of how much they matter:

**1. The vault directory** — the source of truth for documents. Notes, PDFs, canvases,
board thoughts, tasks, bookmarks, calendar events, chat threads are all files.

**2. Zustand stores (16, 2,885 loc)** — `vault`, `editor`, `file-tree`, `file-browser`,
`pdf`, `canvas`, `board`, `tasks`, `calendar`, `bookmarks`, `search`, `chat`, `vault-chat`,
`pptx`, `ui`, `toast`. Mostly in-memory caches and view state. No store uses `persist`
middleware; `Set`/`Map` are avoided because `enableMapSet()` is never called.

Two things in here are _only_ in memory and are silently lost on reload:
`useVaultStore.recentVaults` and `useEditorStore.recentFiles` (capped at 20). The
recent-vaults list `CLAUDE.md` calls for does not survive a refresh.

**3. React context** — `VaultFsContext` (adapters + config), `NotesWorkspaceContext`
(the recursive markdown-path list), `SyncContext` (status + `pushFile`).

**4. `localStorage` / `sessionStorage`** — 42 call sites across 14 files. Almost all of it
is legitimate UI preference (theme, panel widths, collapsed sections, active tab, last
vault path). One entry is not: see §6.1.

**5. IndexedDB** — four stores, none containing document content: `lib/chat/key-store.ts`
(LLM API keys), `lib/fs/handle-store.ts` (FSAPI directory handles), `lib/sync/token-store.ts`
(OAuth tokens), `lib/sync/sync-state.ts` (SHA-256 sync manifest).

**6. Module-scope singletons** — state that is neither in a store nor in a file, and
survives component unmount: the MiniSearch instance (`lib/search/index.ts`), the FS adapter
(`lib/fs/index.ts`), `pendingCanvasSaves` (`components/canvas/canvas-editor.tsx:44`), the
canvas undo-history LRU, the canvas selection clipboard, and two thumbnail caches
(`lib/pdf/thumbnail.ts`, `lib/file-browser/image-thumbnail.ts`).

---

## 5. What the current architecture gets right

Worth stating, because the next section is all problems:

- The `FileSystemAdapter` / `ScopedAdapter` boundary is clean, complete, and already typed
  for `'tauri'`. No feature code touches a browser storage API directly.
- Documents really are files. Nothing important lives only in a database — with one
  exception (§6.1). Deleting `_marrow/search-index.json` today loses nothing, because
  nothing reads it (§6.3).
- The file tree loads lazily: root `readdir` at `notes-file-tree.tsx:90`, per-folder
  `readdir` on expand at `:542`. It does not walk the vault.
- Several heavy libraries are correctly deferred and stay out of the initial bundle:
  PixiJS, KaTeX, `pdfjs-dist`, `plyr`, `jspreadsheet-ce`, `jsuites`, `slidecanvas`,
  `@eigenpal/docx-js-editor`, `@huggingface/transformers`, `@mediapipe/tasks-genai`,
  `mp3-mediarecorder`.
- Canvas and PDF have genuinely careful persistence invariants (save-then-destroy ordering,
  `pendingCanvasSaves` hand-off, PNGs-first/JSON-last, destructive-write snapshots).
- `tsc --noEmit` is clean and there are 59 test files.

---

## 6. Where the code violates the five principles

### 6.1 Principle 1 — files are the only source of truth

**Mostly held. One real breach: starred files.**

`starredPaths` lives in `useFileTreeStore` (`src/stores/file-tree.ts`) and is persisted to
`localStorage` under `ink-marrow:starred:<vaultPath>` by `src/components/views/notes-view.tsx`
(read at `:186`, written at `:201`). It is never written to a file.

Consequences: starring is lost by clearing site data, does not travel with the vault folder,
does not sync through Dropbox, and is invisible to any other tool. Which notes a user has
starred is user-authored data, so this is exactly the state `CLAUDE.md` forbids.

The codebase already has the correct pattern elsewhere — chat threads persist
`favouritedAt` inside the thread JSON — so this is an inconsistency, not a missing capability.

Lesser instances: `recentVaults`/`recentFiles` are app-level, not vault data, so they do not
breach the principle, but they are lost on reload and so do not work either.

### 6.2 Principle 2 — nothing loads until it is needed

**The most serious violation, and the one with a hard number attached.**

The chunks `out/index.html` references total **1,385 KB gzipped**. The budget is 200 KB.
That is **6.9× over**. Opening a markdown note downloads the machinery for file types the
user has not touched.

This survived the Vite migration unchanged, because it is a property of the app's import
graph, not of the bundler — the figure was 1,378 KB under Next. Vite names the eager
vendors, which makes the breakdown easier to read:

| In the eager 1,385 KB                        | gzipped | Why it is there                      |
| -------------------------------------------- | ------- | ------------------------------------ |
| `main` — app code + MiniSearch + gray-matter | 370 KB  | the everything-chunk                 |
| **`vendor-sheets` (SheetJS)**                | 140 KB  | §6.4 — the search indexer imports it |
| **`vendor-codemirror`**                      | 229 KB  | code editor + markdown source mode   |
| **`vendor-pdflib`**                          | 178 KB  | PDF annotation writer                |
| **`vendor-fabric`**                          | 174 KB  | PDF annotation overlay               |
| **`vendor-editor`** (Tiptap/ProseMirror)     | 160 KB  | markdown editor                      |
| **`vendor-flow`** (@xyflow/react)            | 58 KB   | mindmap                              |
| `vendor-react`, `vendor-text`, `fonts`       | 109 KB  | framework + text utils               |

The cause is a single file. `src/components/views/notes-view.tsx` statically imports all
twelve editors at lines 22–39 — `PdfViewer`, `CanvasEditor`, `KanbanEditor`,
`MindmapEditor`, `ImageEditorView`, `CodeFileEditor`, `DocxEditorView`,
`SpreadsheetEditor`, `PptxEditorView`, `PptxCompactViewer`, `VideoPlayerView`,
`AudioPlayerView` — and then picks between them with a ternary at `:604`. Static import
means the bundler must include all of them to render any of them. The chains are short:

```
notes-view.tsx:35  → spreadsheet-editor.tsx → lib/spreadsheet/xlsx-io.ts:7  → xlsx
notes-view.tsx:22  → pdf-viewer.tsx         → pdf-page-canvas.tsx:5-12      → fabric
notes-view.tsx:22  → pdf-viewer.tsx         → lib/pdf/annotation-writer.ts  → pdf-lib
notes-view.tsx:25  → mindmap-editor.tsx:4-22                                → @xyflow/react
notes-view.tsx:33  → code-file-editor.tsx:4-17                              → @codemirror/*
```

There is **no `React.lazy` anywhere in `src/`**. Every deferral in the
codebase is an `await import()` of a _library_ buried inside a component that has itself
already been eagerly loaded. That is why the pattern half-works: `slidecanvas` and
`jspreadsheet-ce` stay out, but `SheetJS` and `Fabric` — imported statically one level up —
do not.

A second, cheaper problem: **pdf-lib, Fabric and SheetJS are each bundled twice**, once in
the eager graph and once as an async chunk (`e4fac512` 96 KB, `bcc84455` 86 KB,
`69f9fc5a` 95 KB). That is ~277 KB gzipped of duplicate copies, because each is reachable
from both a static and a dynamic path.

`ViewRouter` (§3.3) has the same shape at view granularity: eight statically imported views.

### 6.3 Principle 3 — never walk the filesystem at launch

> **Update (item 7a):** the search walk below is gone. The index is SQLite + FTS5 in a worker
> (`src/core/index/`), saved per vault in the browser's private storage. On open, search answers
> from it at once; a background reconcile then lists the vault (metadata only) and re-extracts
> just the new or changed files (`src/lib/search/build-vault-index.ts`). The wiki-link walk and
> the sync hashing walk described below remain (items 7b and 7c).

**Violated three times over, on every single vault open.**

`AppShell` mounts `<VaultSearchBootstrap />` unconditionally at
`src/components/shell/app-shell.tsx:124`. On mount it calls `rebuildVaultSearchIndex(vaultFs)`
(`src/lib/search/build-vault-index.ts:369`), which:

1. recursively walks the entire vault (`collectIndexableFiles`, `:38`), then
2. for **every** markdown, PDF, canvas, mindmap, kanban, PPTX, XLSX, DOCX and code file,
   `await`s `fileTypeToDocument()` in a sequential `for` loop — reading and fully parsing
   each one. For a PDF that means PDF.js text extraction; for PPTX/DOCX a JSZip inflate;
   for XLSX a SheetJS parse.

There is no persisted index to skip this. `SEARCH_INDEX_FILE = '_marrow/search-index.json'`
is declared at `src/types/vault.ts:113` and excluded from sync at `src/lib/sync/excludes.ts:23`,
but **nothing in the codebase ever reads or writes that file**. The constant is dead. The
index is an in-memory MiniSearch instance rebuilt from scratch every open.

Two further full walks happen at the same moment:

- `NotesWorkspaceProvider` (`src/contexts/notes-workspace-context.tsx:33`) calls
  `collectMarkdownPaths()` — another recursive `readdir` of the whole vault — to build the
  wiki-link autocomplete list.
- With sync enabled, `SyncManager.fullSync()` runs on vault open
  (`src/contexts/sync-context.tsx:117`) and `walkDir()` + `hashBytes()`
  (`src/lib/sync/change-detector.ts:16`, `:5`) read every file's bytes to SHA-256 them,
  sequentially.

So a vault open costs three recursive directory walks plus a full read-and-parse of every
indexable file, before the user can do anything. The manifest-first launch that `CLAUDE.md`
requires does not exist in any form.

### 6.4 Principle 4 — no feature reaches into another feature's internals

**87 cross-domain imports across 39 distinct domain pairs, including two cycles.**

Measured by mapping every `@/`-aliased import to its `components|lib|stores` domain folder.
Worst offenders:

| Importer → imported     | count | example                                       |
| ----------------------- | ----- | --------------------------------------------- |
| `notes` → `editor`      | 20    | `markdown-note-editor.tsx`                    |
| `notes` → `search`      | 10    | `notes-file-tree.tsx`, `code-file-editor.tsx` |
| `editor` → `notes`      | 5     | `slash-command-extension.ts`                  |
| `notes` → `spreadsheet` | 4     | `use-new-file-actions.ts`                     |
| `calendar` → `tasks`    | 3     | `week-grid.tsx`, `day-grid.tsx`               |

`notes` reaches into **13 other domains** (51 imports). `editor` is reached into by 8.

**Cycle 1 — `notes` ↔ `editor`.** `lib/editor/` imports React components out of
`components/notes/`: `pdf-embed-extension.tsx:6`, `slash-command-extension.ts:6`,
`vault-image-extension.tsx:8`, `wiki-link-suggestion.ts:6`, `vault-video-extension.tsx:8`.
`components/notes/` imports 20 things back out of `lib/editor/`. An ESLint
`no-restricted-imports` boundary between these two would fail on day one.

**Cycle 2 — `notes` ↔ `search`.** `build-vault-index.ts:4` imports
`lib/notes/tree-filter.ts`; ten files under `notes` import from `search`.

**The search indexer is the clearest case of reaching into internals.**
`src/lib/search/build-vault-index.ts` lines 4–9 import from six feature domains to extract
text:

```ts
import { isNotesTreeHidden } from '@/lib/notes/tree-filter'
import { extractTags, parseNote } from '@/lib/markdown'
import { loadPdfjs } from '@/lib/pdf/pdfjs-loader'
import { extractXlsxText } from '@/lib/spreadsheet/xlsx-io' // ← drags SheetJS eager
import { parseMindmap, extractMindmapText } from '@/lib/mindmap'
import { parseKanban } from '@/lib/kanban'
```

This single import block is why Principles 2 and 4 are the same bug: because search
statically reaches into the spreadsheet module, SheetJS lands in the eager bundle. A
registry where each file type contributes its own lazily-loaded `extractText` fixes both at
once.

Supporting evidence: `eslint.config.mjs` has no `no-restricted-imports` rule, and `src/`
has no `core/` or `registries/` directory. There is nothing in place to enforce a boundary.

### 6.5 Principle 5 — nothing heavy on the main thread

**Effectively unimplemented.** The codebase contains exactly one `new Worker`, at
`src/lib/audio/recorder.ts:118`, and it belongs to the third-party `mp3-mediarecorder`
ponyfill. No application code runs in a worker.

What consequently runs on the main thread:

| Work                                                  | Location                                             |
| ----------------------------------------------------- | ---------------------------------------------------- |
| Full vault parse + index build on every open          | `lib/search/build-vault-index.ts:369`                |
| SHA-256 of every file for sync                        | `lib/sync/change-detector.ts:5`                      |
| PPTX / DOCX inflate + XML text extraction             | `build-vault-index.ts:73`, `:113`                    |
| XLSX parse                                            | `lib/spreadsheet/xlsx-io.ts`                         |
| Markdown round-trip (marked → Tiptap JSON → turndown) | `lib/markdown/`, `lib/editor/`                       |
| Whisper transcription (~40 MB model)                  | `lib/audio/transcribe.ts:55` — no worker             |
| Gemma inference via MediaPipe                         | `lib/chat/providers/device.ts` — WebGPU, main thread |
| Graph layout + Canvas 2D render                       | `lib/graph/build-graph.ts`, `components/graph/`      |

`pdfjs-dist` is the one exception: `loadPdfjs()` (`src/lib/pdf/pdfjs-loader.ts`) sets
`GlobalWorkerOptions.workerSrc`, so PDF _parsing_ is off-thread even though the extraction
loop that drives it is not.

---

## 7. Corrections to the previous version of this document

The prior `docs/ARCHITECTURE.md` (2026-07-14) contained two claims that the code contradicts.
Recording them so they are not re-copied:

1. **§6 claimed the MiniSearch index is "persisted to `_marrow/search-index.json`."** It is
   not. No read, no write; the constant is dead (§6.3).
2. **§9 claimed "heavy editors … are dynamic imports so the base bundle stays lean."** Only
   the innermost libraries are dynamic. The editor components are statically imported, and
   the base bundle is ~1.4 MB (§6.2).

`CLAUDE.md`'s own description of nav order and view modes also predates `OrganizerView`,
which now absorbs Tasks and Calendar as tabs (`view-router.tsx:43-51`).

### What the Vite migration changed (2026-09-28)

Behaviour is unchanged — the full e2e suite gives identical results on both builds (203
passed, same one pre-existing failure, same one known flake). Three things it required are
worth knowing, because each was invisible under Next:

1. **`src/node-globals.ts`** — webpack silently polyfilled `Buffer` and `global` for the
   browser; Vite does not. `gray-matter` calls `Buffer.from()` on **every** frontmatter
   parse and stringify, so without this every feature that touches frontmatter throws.
   Imported first by both entries.
2. **The service worker never actually cached the app shell.** `sw.js` only precached `/`,
   `/manifest.json` and `/icon.svg`; offline loads were surviving on the browser's HTTP
   cache, which is why Next's CSS intermittently failed offline. The entries now warm the
   cache through the SW's own fetch handler once it controls the page.
3. **`build.rollupOptions.output.manualChunks`** groups the large eager vendors. Without it
   the eager graph is a single 4.3 MB asset, which no cache can populate promptly. Only
   name packages in there that are _already_ eager — adding a lazy-only one (e.g.
   `jspreadsheet-ce`) drags it into first paint.

The PDF.js worker is now served from `public/` (copied by `scripts/copy-pdf-worker.mjs`)
rather than resolved by the bundler: `new URL('pdfjs-dist/...', import.meta.url)` is a
webpack-only affordance.

---

## 8. Reproducing the measurements

```bash
# LOC and file count
find src -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + | tail -1

# Eager JS: sum the gzipped chunks index.html actually references
pnpm build
for f in $(grep -oE 'assets/[^"]+\.js' out/index.html | sort -u); do
  printf '%8d  %s\n' "$(gzip -9 -c "out/$f" | wc -c)" "$f"
done

# Is a library eager or lazy? Eager ⇔ its chunk is named in index.html.
grep -oE 'assets/[^"]+\.js' out/index.html | sort -u
grep -l "RenderTexture" out/assets/*.js    # pixi → NOT in index.html ⇒ correctly lazy

# Workers, web storage, dynamic boundaries
grep -rn "new Worker" src/
grep -rn "React.lazy" src/                        # → no results
grep -rn "localStorage\.\|sessionStorage\." src/ | wc -l

# Launch-time walks
grep -rn "collectIndexableFiles\|collectMarkdownPaths\|walkDir" src/

# Cross-domain import graph (script written for this audit, not committed)
```

The `_marrow` → `_mentis` rename cost, for planning: **54 hardcoded `'_marrow'` string
literals across 23 files**, against only 13 uses of the `MARROW_DIR` constant
(`src/types/vault.ts:107`).

---

## 9. What I would tackle first, in order

Ordered by (unblocks-the-most × smallest blast radius). Items 3 and 7 exceed the two-file
threshold in `CLAUDE.md`'s working agreement and need a plan approved before any edit.

### 1. Stop rebuilding the search index on every vault open

**Why first.** It is the only item that violates four principles at once (2, 3, 4, 5), it is
the largest single cost on the critical path to a usable window, and it needs no design
debate — a manifest-backed index is already a settled decision. Blast radius is three files
(`vault-search-bootstrap.tsx`, `build-vault-index.ts`, `app-shell.tsx`).

Two halves, both of which survive the eventual move to SQLite + FTS5:

- Replace the launch-time walk-and-parse with load-then-reconcile. Persist the index (today
  to the already-declared `SEARCH_INDEX_FILE`, later to SQLite), load it on open, and
  reconcile against `stat` in the background instead of re-reading every file.
- Give each file type a lazily-imported `extractText` so `build-vault-index.ts` stops
  statically importing six feature domains. This is what removes SheetJS from the initial
  bundle, so it pays for itself twice.

### 2. Move adapter selection out of the landing component

**Why second.** It is tiny, carries no user-visible risk, and the Tauri migration cannot
start until "which filesystem am I on" stops being a decision made inside
`vault-landing.tsx`. Make `getFileSystemAdapter()` the single place that picks a backend,
have it detect the platform, and let a `TauriAdapter` slot in beside `Opfs`/`Fsapi` behind
the interface that already names it. Do this before the migration needs it, not during.

### 3. A file-type registry, with lazy viewers and editors

**Why third.** This is the structural keystone — the single change that most reduces the
1,385 KB, creates the first real registry, and breaks the largest god-component. It is third
only because it is the biggest diff and benefits from (1) having already moved extraction
behind a per-type hook.

One `{ match(path), icon, viewer, editor, createNew, extractText }` registration per type
replaces: `getFileType()`'s extension switch, `editorTabTypeFromVaultPath()`, the 12-arm
ternary at `notes-view.tsx:604`, the 10-deep icon ternary in `notes-file-tree.tsx`,
`fb-file-card.tsx`'s two switches, and `typeFromPath()` in `build-graph.ts`. Load `viewer`
and `editor` through `React.lazy` — currently used nowhere — so opening a note stops
pulling Fabric, CodeMirror, xyflow and pdf-lib.

Two things to expect: a `match(path)` predicate finally makes the compound extensions
(`.map.md`, `.kan.md`, `.slides.md`) expressible, which the current last-dot-segment lookup
cannot do; and the `lib/editor` ↔ `components/notes` cycle (§6.4) has to be broken as part
of this, since it will otherwise trip the import boundary on day one.

### 4. Put the performance budgets in CI

**Why fourth and not first.** A gate that fails on every build gets disabled. Land it once
(1) and (3) have moved the number, then record the real figure as the ceiling and ratchet
down. Sum the gzipped chunks `out/index.html` references, fail over threshold. Per `CLAUDE.md`, the
ceiling only ever goes up as a separately committed decision.

### 5. Move starred files into the vault

Small, self-contained Principle 1 fix — worth doing while item 3 is already touching the
tree. Persist stars where the vault can see them (`_marrow/config.json`, or per-note
frontmatter to survive moves), following the pattern chat threads already use with
`favouritedAt`. Read the existing `localStorage` key once and migrate it.

### 6. Move hashing and extraction into workers

The sync SHA-256 pass and the text extractors are the two places where a large vault visibly
freezes the UI. They are good first workers because both are pure byte-in/string-out with no
DOM dependency. Deliberately after (1), which removes the launch-time extraction entirely —
doing it in the other order would mean building a worker for work that should not be
happening at that moment anyway.

### 7. Rename `_marrow` → `_mentis`, `_dailies` → `_journals`

Mechanical, but it rewrites paths users have on disk, so it needs a one-time migration on
vault open and should land alone, after the registry has centralised path knowledge. Route
all 54 hardcoded literals through constants first, then rename the constant — the literals
are the risk, not the rename.

**Deliberately not in this list:** the notebook/section model, `_config.md` inheritance,
capture grammar, chrono-node parsing, and the Vite/Tauri port itself. All are settled
decisions in `CLAUDE.md`, none are blocked by the seven items above, and each is easier once
the registry exists and the launch path is quiet.

---

Related: [`TECH_STACK.md`](./TECH_STACK.md) · [`CONVENTIONS.md`](./CONVENTIONS.md) ·
[`CLOUD_SYNC.md`](./CLOUD_SYNC.md) · [`DEPLOYMENT.md`](./DEPLOYMENT.md) ·
[`LAUNCH_DEFERRALS.md`](./LAUNCH_DEFERRALS.md) · [`RISKS.md`](./RISKS.md)
