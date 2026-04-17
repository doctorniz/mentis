# Mentis — Development Phases

## Phase 1 — Web MVP (Weeks 1–12)

**Goal:** A usable web app with markdown editing, PDF file management, unlimited canvas, wiki graph view, quick-capture Board, and a **Vault / Search / Graph / Board** shell (plus **New** popover) — all in the browser, offline-capable.

**Pre-launch scratch list:** [LAUNCH_DEFERRALS.md](./LAUNCH_DEFERRALS.md) — track items to clear before public release.

**License:** Source is under **BSL 1.1** — [`LICENSE`](../LICENSE). High-level summaries: [ARCHITECTURE.md](./ARCHITECTURE.md) §10, [PRD.md](./PRD.md) §6, [CONVENTIONS.md](./CONVENTIONS.md) (License). **AI-assisted development** is noted in the README and [CURSOR.md](./CURSOR.md).

How this file is organized:

- **Phase 1 → Completed work:** week-by-week shipped items (all checked unless noted).
- **Manual verification queue:** human smoke tests in `LAUNCH_DEFERRALS.md` (**To do** vs **Done** checklists).
- **Pre-launch hardening → Open:** still needs code or design work.
- **Pre-launch hardening → Completed archive:** addressed items kept for history.
- **Phase 2+:** future roadmap (mostly unchecked).

### Phase 1 — Completed work (Weeks 1–12)

### Week 1–2: Foundation

- [x] Project scaffolding (Next.js, TypeScript, Tailwind, ESLint, Prettier)
- [x] File system adapter interface + OPFS implementation
- [x] File System Access API adapter (Chromium) — `FsapiAdapter` wraps `showDirectoryPicker()`; feature-detected on vault landing
- [x] Vault open/create flow
- [x] `_marrow/` directory bootstrapping (config.json, empty folders)
- [x] **View Manager** — shell: Vault, Search, Graph, Board, Bookmarks; **New** via popover (`Ctrl+N`); legacy `ViewMode.FileBrowser` / `Notes` route into unified `VaultView`
- [x] Sidebar navigation component
- [x] Basic layout: sidebar + main content pane
- [x] Keyboard shortcut system (`Ctrl/Cmd+1` Vault, `+2` Search, `+3` Graph; `Ctrl/Cmd+N` New popover; `Ctrl/Cmd+F` Search; `Ctrl/Cmd+\` toggles sidebar)

### Week 3–4: Markdown Editor

- [x] Tiptap editor integration with ProseMirror
- [x] Live WYSIWYG markdown rendering (Markdown ↔ editor via **marked** + **@tiptap/html** + **turndown**; not identical to raw GFM for all nodes)
- [x] Raw source view toggle (full-file `.md` in a textarea; per-tab Visual / Source; sync back into Tiptap on return)
- [x] Frontmatter parsing and persistence (gray-matter via `parseNote` / `serializeNote`; title updates tab label)
- [x] Basic slash menu (`/`): headings, lists, quote, code block, divider, task list (Tiptap **Suggestion**)
- [x] Folder tree sidebar for Notes view (lazy-loaded folders; hides `_marrow` / `_assets`)
- [x] File create (new untitled note); [x] rename (sidebar pencil + dialog); [x] delete (tree trash + confirm; see P0 hardening)
- [x] Formatting toolbar (bold, italic, strike, code, headings, lists, quote, HR)
- [x] Auto-save on debounced changes (~750ms) + save on tab switch / unmount
- [x] Tab system for multiple open files

### Week 5: Linking & Navigation

- [x] Wiki-links `[[...]]` syntax with autocomplete dropdown (type `[[`, pick note; body round-trips via marked + turndown)
- [x] Backlink panel (shows which notes link to the current note; rescans on save / vault changes)
- [x] Starred notes (sidebar + tree star control; persisted per vault in `localStorage`)
- [x] Recent files tracking and list in sidebar (persisted per vault in `localStorage`)
- [x] Note-to-note navigation via wiki-link clicks (resolves stem with `resolveWikiLinkPath` — spaces, hyphens, and underscores normalized for basename match; `#page=` in target ignored for navigation)

### Week 6: Search

- [x] MiniSearch index initialization on vault open (`VaultSearchBootstrap` → `rebuildVaultSearchIndex`)
- [x] Incremental index updates on file save / rename (`reindexMarkdownPath`, `removeSearchDocument`)
- [x] Search view UI: search bar, results list, grouped by file type (Notes / PDFs / Canvases)
- [x] Filters: file type checkboxes, folder prefix, comma-separated tags, date range; `#tag` in query ANDs with filters
- [x] Instant-as-you-type results with debouncing (~220ms)
- [x] Tag extraction from frontmatter + body `#tag` into index; query supports `#tag` tokens
- [x] Search result previews with highlighted match snippet (`buildSnippet` + `<mark>`)

### Week 7: PDF File Browser

- [x] File Browser view: grid (card thumbnails) and list mode (`useFileBrowserStore` for state)
- [x] PDF thumbnail generation (PDF.js first-page render → blob URL, cached, `lib/pdf/thumbnail.ts`)
- [x] Sort: name, date modified, size, type — click button to cycle field, toggle asc/desc
- [x] Filter: file-type checkboxes (PDF, Notes, Canvas, Image, Other) in collapsible bar
- [x] Right-click context menu: Open, Rename, Duplicate, Move, Delete (Radix `ContextMenu`)
- [x] Drag-and-drop import with current-folder targeting + `FbImportZone`
- [x] `_inbox/` folder: quick button when at root and inbox exists; opens as a subfolder
- [x] Batch operations: multi-select (checkbox), batch Move + Delete; select all / deselect all
- [x] Import button with native `<input type="file" multiple>` file picker

### Week 8: PDF Viewer & Basic Annotations

- [x] PDF.js embedded viewer: page navigation (scroll + prev/next), zoom (0.25–5×), **in-PDF text search (P11)** — `search-pdf-text.ts` + highlights on `PdfPageCanvas`
- [x] Outline/bookmark sidebar (reads PDF outline via `getOutline`, nested tree, click → scroll to page)
- [x] **Side column (Pages + Outline)**: `PdfSideColumn` — tabbed **Pages** / **Outline**, collapsible rail (`Layers`); auto-collapses when PDF has ≤1 page; no toolbar toggle (removed in favour of column chrome only)
- [x] Fabric.js canvas overlay on each page (renders at `zoom` scale, syncs tool mode)
- [x] Highlight tool: drag rectangle → color picker → stored as `PdfHighlight` annotation
- [x] Freehand drawing tool: pen color, thickness slider → `PencilBrush` → stored as `PdfInkAnnotation`
- [x] Destructive write-back via pdf-lib on save (highlights → `drawRectangle`, ink → `drawLine` segments)
- [x] Annotation toolbar: Select | Highlight | Draw | Text | Comment | Sign + colour swatches + stroke width + zoom + page nav + Add page + Undo/Redo (page ops) + Form | History | Search — **no** Save/Flatten/Side panel (autosave via `VaultConfig.autoSave`)
- [x] **Separate pen vs highlight colors (P4)**: `usePdfStore` has `highlightColor` (pastels) and `drawColor` (default `#000000`); Draw swatches include black first; switching tools does not copy highlight tint onto the pen; `tests/pdf-store-colors.test.ts`
- [x] **Separate text box colour (P14)**: `textColor` + `setTextColor`; `PdfToolbar` third swatch row (ink palette) when Text tool active; FreeText `fontColor` from `textColor`; `tests/pdf-store-colors.test.ts`
- [x] Existing annotation detection: reads `/Highlight` and `/Ink` annotations from PDF pages via `getAnnotations`, renders as editable Fabric objects

### Week 9: Advanced PDF Annotations

- [x] Signature system: draw on pad or upload image — `SignaturePadDialog` with draw/upload modes
- [x] Signature storage in `_marrow/signatures/` — `lib/pdf/signature-store.ts` persists index.json
- [x] Signature placement (P8): after place `setActiveTool(Select)`; stamp rect sync on `object:modified` → autosave — PdfPageCanvas Sign tool + annotation-writer `embedPng`/`embedJpg`
- [x] Text box insertion tool → `/FreeText` annotation — PdfPageCanvas Text tool places editable Fabric Textbox; written via `page.drawText`
- [x] **PDF FreeText UX (P3)**: after place, `setActiveTool(Select)` (canvas parity); `PdfToolbar` hint row + tool `title` for Select / double-click to edit; `editable: true` on rebuilt Textbox; `text:editing:exited` + `object:modified` sync Fabric → `updateAnnotation`
- [x] Text comment tool (P6/P7) — `PdfCommentDialog` + `pendingPdfComment` in `usePdfStore`; `PdfPageCommentRail` margin list; `annotation-writer` emits native `/Text` with `InkMarrow` strip; `annotation-reader` reloads `/Text` + `contentsObj`
- [x] Auto-save implementation — `PdfViewer` uses `VaultConfig.autoSave` (`intervalMs`, default 5s) + optional `saveOnBlur` from `useVaultStore`
- [x] Snapshot creation on first edit (`_marrow/snapshots/`) — uses existing `lib/snapshot` on first `hasUnsavedChanges`
- [x] Snapshot retention and pruning — `pruneSnapshots(vaultFs, config)` with max 5 per file, 30-day retention

### Week 10: PDF Page Management

- [x] Page panel with thumbnails — `PdfPagePanel` inside `PdfSideColumn` **Pages** tab; `PageThumbnail` uses offscreen PDF.js render then blit to visible canvas; column toggled via side column only
- [x] Drag-to-reorder pages — HTML5 drag-and-drop in page panel triggers `reorderPages` (pdf-lib `copyPages`)
- [x] Insert blank page (before/after) — panel toolbar button, `insertBlankPage` supports blank/lined/grid/dot-grid styles at A4/Letter/custom sizes
- [x] Delete page — panel toolbar button, `deletePage` (guards against deleting the sole page)
- [x] Rotate page (90°, 180°, 270°) — panel toolbar button, `rotatePage` applies cumulative rotation via `page.setRotation(degrees())`
- [x] Merge: drag another PDF into page panel to append — drop zone + file picker, `mergePages` copies all pages from source PDF
- [x] Split: extract page range to new PDF — split mode in panel (click start + end), `splitPages` creates new file at `<stem>_pages_N-M.pdf`
- [x] Form field detection and filling (P10) — `getFormFields` never throws for empty/broken forms; `PdfFormDialog` friendly empty state; `fillFormFields` writes values back
- [x] All operations written to PDF via pdf-lib on save — `applyPageOp` helper: transform → write → reload cycle

### Week 11: New View & Canvas Foundation

- [x] New view UI: three creation paths (Markdown Note, PDF Note, Canvas) — tabbed `NewView` with Markdown/PDF/Canvas/Templates tabs
- [x] New Markdown Note: blank or from template, name + folder picker — recursive folder walk for picker, template select dropdown, `openTab` on create
- [x] New PDF Note: page style (blank/lined/grid/dot grid), page size (A4/Letter/Custom) — style/size chip selectors, creates via `PDFDocument.create()` + `insertBlankPage`
- [x] PDF Note creation via pdf-lib with styled backgrounds — reuses `page-operations.ts` `drawPageStyle` (lined/grid/dot-grid)
- [x] Template management UI in `_marrow/templates/` — `TemplateManager` with list, delete, and create form; backed by `lib/notes/template-store.ts`
- [x] **Unlimited Canvas**: Fabric.js infinite surface with pan and zoom — `CanvasEditor` with mouse-wheel zoom + middle-click/Alt-drag pan, min/max zoom 0.1–5×
- [x] Freehand drawing on canvas with pressure sensitivity — `PencilBrush` drawing mode, paths recorded as `CanvasDrawingNode` with per-point pressure support
- [x] Text cards: resizable text blocks with basic markdown formatting — `FabricTextbox` placed on click with Text tool, serialized as `CanvasTextNode`; sticky notes via `FabricRect` + `FabricTextbox`
- [x] Image embeds: drag-and-drop onto canvas — file picker → `FileReader` → `FabricImage.fromURL`, stored as `CanvasImageNode` (data URL)

### Week 12: Canvas Features & Polish

- [x] Canvas connectors: arrows/lines between objects — Connect tool: click two nodes to draw a `FabricLine` + `FabricTriangle` arrow; stored as `CanvasEdge`
- [x] Sticky notes: colored blocks for quick ideas — already in Week 11; this week adds random color cycling and persistence in `CanvasFile.frames`
- [x] Sections/frames: group canvas regions for presentation — `handleAddFrame` creates a dashed-border `FabricRect` + label; stored as `CanvasFrame` with label/color
- [x] Canvas export to PDF/PNG — Export PNG via `fc.toDataURL()` at 2× multiplier; Export PDF via lazy-loaded pdf-lib `embedPng` → download
- [x] Canvas auto-save to `.canvas` JSON — 15 s `setInterval` + `window blur` auto-save (mirrors PDF auto-save pattern)
- [x] Canvas cross-linking via `[[wiki-links]]` — `CanvasWikiLinkNode` type; toolbar button prompts for target, renders as blue pill card on canvas
- [x] Service Worker for offline caching (Workbox) — `public/sw.js` stale-while-revalidate strategy, precaches shell; registered in root layout
- [x] Performance optimization pass — Fabric.js `requestRenderAll` for panning (batched), canvas keyboard shortcuts scope-guarded (skip in inputs), `ResizeObserver` for container
- [x] Bug fixes and UI polish — AppShell keyboard shortcuts remapped (Ctrl+1/2 views, Ctrl+\ sidebar, Ctrl+N new, Ctrl+F search, Ctrl+Shift+? help); canvas Delete/Backspace removes selected objects
- [x] Keyboard shortcuts documentation — `lib/keyboard-shortcuts.ts` defines all shortcuts; `KeyboardShortcutsDialog` (Radix) groups by category; opened via Ctrl+Shift+?
- [x] PWA manifest and icons — `public/manifest.json` with standalone display, SVG icon; `layout.tsx` adds manifest link, theme-color viewport, apple-web-app meta, service worker registration

### Phase 1 Exit Criteria

A user can:
- ✅ Create and open a vault
- ✅ Navigate via Vault (🌳 tree / 🗂️ browse), Search, Graph, and New (popover); open markdown, PDF, canvas, and images from the vault
- ✅ Write and edit markdown notes with WYSIWYG rendering
- ✅ Use wiki-links to connect notes with backlink tracking
- ✅ Use slash commands for quick formatting
- ✅ Search across the entire vault with instant results
- ✅ Browse, import, and create PDFs in the file browser
- ✅ View, annotate (highlight, draw, sign, text), and save PDFs
- ✅ Manage PDF pages (reorder, insert, delete, rotate, merge, split)
- ✅ Fill PDF form fields
- ✅ Create unlimited canvases with drawing, text, images, connectors
- ✅ Work entirely offline in the browser

---

## Manual verification

Checklists for human smoke-testing in the app (Vault modes, PDF tools, canvas, export, etc.) live in **[LAUNCH_DEFERRALS.md — Manual verification queue](./LAUNCH_DEFERRALS.md#manual-verification-queue)** (**To do** = `- [ ]`, **Done** = `- [x]`). Update **To do** whenever shipped behavior changes; repeat those items in PRs or chat under **Manual verification** so nothing is missed.

---

## Pre-Launch Hardening Checklist

Issues and gaps from codebase review. **Open** items still need work; **Completed archive** keeps resolved items for history.

### Open items (action required)

| Track | Item | Notes |
|-------|------|--------|
| P3 | Framer Motion unused | In `package.json` but no imports — remove dep or integrate |
| P4 | Note view padding | Tune spacing (px, py, gap) in mode bar, toolbar, title, content |
| P4 | Save note as template / templates folder | Option to save a note as template; or convention for configurable templates folder (`Settings` already has `templateFolder`) |

### Completed archive — P0 — Must Fix Before Any Users

- [x] **Note delete**: Trash icon on each tree node + confirm dialog; removes file, closes tab, cleans search index
- [x] **Unsaved-changes guard**: `beforeunload` event checks dirty tabs, PDF, and canvas stores; browser prompts before close
- [x] **Error boundary**: `ErrorBoundary` class component wraps `AppShell`; shows error message + "Try Again" / "Reload" buttons
- [x] **`navigator.storage.persist()`**: called on vault open in `AppRoot.handleVaultReady`; prevents browser eviction of OPFS data
- [x] **PDF write safety**: load checks `%PDF-` header; save writes to `.__ink_tmp`, verifies header, then renames to target path
- [x] **PDF annotation persistence (P5)**: post-save `loadPdf` + restore page/zoom so flattened content shows in the raster layer and repeat saves do not stack duplicates; `addAnnotation(..., { fromLoader: true })` when hydrating from disk avoids false **unsaved** / autosave loops; `annotation-writer` JSDoc clarifies content-stream vs native annotations
- [x] **Canvas `onBeforeUnmount` flush**: init effect cleanup syncs Fabric state to `CanvasFile` and writes to disk before disposing

### Completed archive — P1 — Important for Quality

- [x] **FSAPI adapter**: `FsapiAdapter` in `lib/fs/fsapi.ts` wraps `showDirectoryPicker()` handle; `isFsapiSupported()` + `pickDirectoryFsapi()` helpers; "Open folder" button on vault landing auto-detects existing vaults or bootstraps new ones
- [x] **Dark mode**: CSS custom properties for light/dark palettes in `globals.css`; Tailwind v4 `@variant dark` class-based; anti-flash inline script in `layout.tsx`; `useUiStore` persists to `localStorage` and syncs `<html class="dark">`; three-state toggle (Light / System / Dark) in sidebar; `prefers-color-scheme` media query listener for live system-theme tracking
- [x] **Toast / notification system**: Zustand-based `stores/toast.ts` with `toast.info/success/error/warning()` helpers; `<Toaster>` portal component in `ui/toaster.tsx` rendered from `app-root.tsx`; auto-dismiss timers per variant; all `console.error` user-facing paths now show toasts (note save/load, PDF save/load/integrity, canvas save, note delete)
- [x] **Note delete from file tree**: Trash icon per note in tree; confirmation dialog; removes from FS, search index, and open tabs; toast feedback on success/failure (implemented during P0)
- [x] **Duplicate PDF loader in `thumbnail.ts`**: removed private `loadPdfjs()` from `thumbnail.ts`; now imports shared singleton from `pdfjs-loader.ts`
- [x] **`pdf/index.ts` vs `pdf/page-operations.ts` overlap**: consolidated all PDF operations into `page-operations.ts` (single source of truth); `pdf/index.ts` is now a barrel re-export for the entire `lib/pdf/` module
- [x] **Canvas wiki-link navigation**: double-clicking a wiki-link card resolves the target via `resolveWikiLinkPath` and navigates to the Notes view with the tab opened; `__wikiTarget` stored on Fabric objects; toast shown if target note not found
- [x] **Canvas sticky text sync**: `syncFabricToFile` now strips `_text` / `_wl` suffixes to find the parent node and syncs sticky note text from the companion textbox back to `CanvasStickyNode.text`
- [x] **Search: PDF body text indexing**: `extractPdfText()` in `build-vault-index.ts` uses pdfjs `getTextContent()` to extract text from all pages (capped at 14k chars); PDF metadata title (`info.Title`) also used when available; full-text search now covers PDF content
- [x] **Virtualized lists**: `@tanstack/react-virtual` added; file browser list view (`VirtualList`, 40px rows), grid view (`VirtualGrid`, `ResizeObserver`-driven column count), and search results (`SearchResultsList`, flat header+item rows) all virtualized with overscan

### Completed archive — P2 — Should Fix

- [x] **Tests: unit test suite**: 21 files under `tests/` (261 tests) — core: `markdown.test.ts`, `markdown-bridge.test.ts`, `search.test.ts`, `canvas.test.ts`, `canvas-undo.test.ts`, `toast.test.ts`, `fs-adapter.test.ts`, `file-utils.test.ts`; PDF: `pdf-operations.test.ts`, `pdf-search-text.test.ts`, `pdf-store-colors.test.ts`, `pdf-annotation-writer.test.ts`; notes/vault: `daily-note.test.ts`, `folder-ops.test.ts`, `graph.test.ts`, `snapshot.test.ts`, `editor-tab-from-path.test.ts`, `image-edit-pipeline.test.ts`; misc: `assets.test.ts`, `download-file.test.ts`, `export-pdf.test.ts`. `vitest.config.ts`; `happy-dom` for DOM-needing suites
- [x] **Service Worker caching strategy**: `sw.js` upgraded to v2 — `_next/static/*` assets use **cache-first** (immutable content-hashed bundles cached on first fetch, served instantly thereafter); all other same-origin GETs use **stale-while-revalidate** (serve cached, refresh in background); precache still seeds `/`, `/manifest.json`, `/icon.svg` on install; old caches pruned on activate
- [x] **`next.config.ts` `headers()`**: removed dead `headers()` config (no effect with `output: 'export'`); added inline comment documenting how to set COOP/COEP headers on Vercel, Netlify, Cloudflare, S3+CloudFront, and nginx
- [x] **PWA icons**: generated `icon-192.png` and `icon-512.png` from SVG via sharp; manifest updated with all three icon entries (SVG `any`, PNG 192 `any maskable`, PNG 512 `any maskable`); `layout.tsx` updated with PNG favicon and apple-touch-icon links; SW precache list includes both PNGs
- [x] **Tiptap version alignment**: all 18 `@tiptap/*` packages pinned to `^2.27.2` floor — ensures all extensions resolve to the same minor on fresh install (currently 2.27.2; Tiptap 3.x available but is a breaking major)
- [x] **`output: 'export'` + service worker**: verified — `next build` copies `public/sw.js` to `out/sw.js` (site root); works on Vercel, Netlify, Cloudflare Pages, S3; registration updated with explicit `{ scope: '/' }`; also fixed type error in `build-vault-index.ts` and removed stale lint directives in `canvas-editor.tsx` and `pdf-page-panel.tsx`
- [x] **remark/unified unused**: removed 7 unused packages (`unified`, `remark-parse`, `remark-stringify`, `remark-gfm`, `remark-frontmatter`, `remark-math`, `rehype-katex`) — zero runtime imports confirmed; re-add individually if AST transforms or KaTeX are implemented later
- [x] **`hooks/` directory missing from docs**: `src/hooks/` exists with `use-auto-save.ts` and `use-keyboard-shortcuts.ts` but was missing from CONVENTIONS project tree — added
- [x] **Markdown tables**: wired `Table`, `TableRow`, `TableCell`, `TableHeader` into `getNoteEditorExtensions`; added Turndown rules for GFM pipe-table round-trip; added `.ink-table` CSS styles (borders, header bg, selected-cell highlight); 2 new bridge tests
- [x] **Code block syntax highlighting**: wired `CodeBlockLowlight` with `lowlight` (common languages) replacing StarterKit's default `codeBlock`; added `--hl-*` CSS custom properties for both light and dark palettes; highlight.js class → token color mappings in `globals.css`
- [x] **Math (KaTeX)**: custom `MathInline` and `MathBlock` Tiptap nodes with `data-latex` attribute; KaTeX lazy-loaded for live rendering via `addNodeView`; markdown bridge preprocesses `$...$` and `$$...$$` to HTML before marked; Turndown rules convert back; KaTeX CSS imported in `globals.css`; 4 new bridge tests
- [x] **Canvas edge deletion**: extracted `removeCanvasObject()` helper that removes all sibling Fabric objects sharing the same `__edgeId` (line + triangle head) or `__nodeId` (sticky rect + `_text`, wiki-link rect + `_wl`); used by both the eraser click handler and the Delete/Backspace keyboard handler
- [x] **Markdown bridge: task list round-trip**: added `preprocessTaskLists()` that converts `- [ ]`/`- [x]` lines into `<ul data-type="taskList"><li data-type="taskItem" data-checked>` HTML before marked parses, so Tiptap's `TaskList`/`TaskItem` extensions recognise them; added Turndown `taskItem`/`taskList` rules that detect Tiptap's boolean `data-checked` attribute and emit `- [ ]`/`- [x]`; 3 new bridge tests (parse, output, round-trip)
- [x] **Markdown bridge: list indentation**: overrode Turndown's built-in `listItem` rule with a compact variant that uses `marker + ' '` (e.g. `- item`) instead of the default `marker + '   '` (`-   item`); ordered lists also compact (`1. item` instead of `1.  item`)
- [x] **JSDOM/canvas native dep in tests**: verified — global vitest env is `node`; DOM-needing tests opt in via `@vitest-environment happy-dom` docblock; `jsdom` is not installed so accidental use produces a clear error; documented the constraint in `vitest.config.ts`

### Completed archive — P3 — Nice to Have

- [x] **Daily notes shortcut**: added `lib/notes/daily-note.ts` with `openOrCreateDailyNote()` that creates/opens `daily/YYYY-MM-DD.md` with frontmatter and heading; calendar button in file tree sidebar; `Ctrl/Cmd+Shift+D` keyboard shortcut; 7 unit tests
- [x] **File tree folder operations**: added create-subfolder (dialog + `FolderPlus` button on each folder row and sidebar header), delete-folder (recursive with confirmation, closes nested tabs, clears search index), rename-folder (recursive copy-and-delete via `lib/notes/folder-ops.ts`, updates tabs and selected path); 6 unit tests for `renameFolder`/`collectFilePaths`
- [x] **Image/file embeds in notes**: drag-and-drop or paste images into the editor — saved to `_assets/` with unique names via `lib/notes/assets.ts`; custom `VaultImage` Tiptap node (schema-only for bridge) + `VaultImageExtension` (React NodeView for live editor) resolves vault-relative paths to blob URLs; standard `![alt](path)` markdown syntax round-trips through the bridge; CSS for inline rendering and selection highlight; 11 new tests (assets + bridge)
- [x] **Embedded PDF pages in notes**: custom `pdfEmbed` Tiptap node with `file` and `page` attributes; markdown bridge preprocesses `![[file.pdf#page=N]]` and `![[file.pdf#page=N-M]]` to `<div data-type="pdf-embed">` before marked; Turndown rule serializes back; React NodeView renders PDF pages inline via pdfjs-dist canvas; supports single page and ranges (capped at 20); 6 new bridge tests (parse, output, round-trip)
- [x] **Export note as PDF**: `buildExportHtml` generates a standalone, print-ready HTML document from Tiptap JSON (with inline base64 vault images); `printExportHtml` opens it in a new window and triggers `window.print()` for native browser "Save as PDF"; 9 tests
- [x] **Export note dropdown (Markdown + Print)**: `NoteEditorModeBar` compact icon trigger opens a Radix `DropdownMenu` (`modal={false}`) — **Markdown** downloads `.md` via `lib/browser/download-file.ts` (`serializeNote` + raw buffer in Source mode); **Print** runs `buildExportHtml` + `printExportHtml`; works from Visual or Source; icon-only Visual/Source and sidebar theme toggles (F8/M1 polish).
- [x] **Version history UI**: `PdfVersionHistory` sidebar panel lists snapshots for the current PDF with relative timestamps and file sizes; `restoreSnapshot` creates a safety snapshot of the current version before overwriting with the selected snapshot; `deleteSnapshot` removes individual snapshots; inline confirm-to-delete; History toggle button in `PdfToolbar`; `parseSnapshotTimestamp` utility to decode encoded ISO strings; 11 tests
- [x] **`flattenPdf` helper**: `flattenPdf` + `downloadBytes` in `lib/pdf/page-operations.ts` (pdf-lib `form.flatten()`) — usable for future export UX; **Flatten** toolbar button removed (2026); tests remain valid for the library functions
- [x] **Graph view**: `buildNoteGraph` scans all markdown files, extracts wiki-links, and resolves them to build a node+edge model; `filterGraphByFolder` and `graphFolders` support folder filtering; `GraphCanvas` renders an interactive force-directed layout on Canvas 2D (repulsion, attraction, center gravity, damping) with zoom/pan/drag/click-to-open; `GraphView` wired as 5th app view with sidebar nav (GitFork icon, Ctrl+3), folder filter dropdown, node/link counts; 13 tests
- [x] **`idb-keyval` unused**: removed — zero imports in codebase
- [x] **Canvas undo/redo**: `CanvasUndoStack` class stores deep-cloned `CanvasFile` snapshots (capped at 50); every mutation (add node/edge/frame, draw, erase, delete) snapshots before changing state; `handleUndo`/`handleRedo` restore the snapshot and re-render the Fabric canvas; Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y keyboard shortcuts; Undo/Redo toolbar buttons with disabled state; 11 tests
- [x] **Board view**: quick-capture notice board (`Ctrl+4`, sidebar "Board" with `LayoutGrid` icon). **Thoughts** stored as `.md` files in `_board/` (hidden from file tree, file browser, and search index via `isNotesTreeHidden` + `isHiddenPath`). Frontmatter: `type: thought`, `color`, `created`, `modified` — title derived from first `# H1` line if present. Masonry CSS-columns layout with pastel-tinted cards. Click to inline-edit via minimal Tiptap (bold/italic/underline/lists/links — keyboard shortcuts only, no toolbar, no font changes; `board-extensions.ts`). Image thoughts: file picker → `_board/_assets/`, rendered with embedded preview. Color picker via right-click on "Thought" button. `useBoardStore` (Zustand + Immer) manages CRUD; `lib/board/index.ts` for parse/serialize. Future: bookmarks, lists, reminders, tasks, audio — same `_board/` folder differentiated by `type` frontmatter.
- [x] **Bookmarks view**: web bookmark manager (`Ctrl+5`, sidebar "Bookmarks" with `Bookmark` icon). `.md` files in `_bookmarks/` with frontmatter (url, title, description, favicon, ogImage, tags, timestamps). Categories as subfolders. On add, `og-fetch.ts` scrapes Open Graph metadata + Google favicon service — graceful CORS fallback. Two-panel layout: category sidebar (folder list with counts, add/delete category) + bookmark list (favicon, title, domain, description, OG thumbnail, tag pills, edit/delete on hover). Add/edit via Radix Dialog with URL input + OG preview + editable fields + category picker. `useBookmarksStore` (Zustand + Immer) manages CRUD + category ops; `lib/bookmarks/index.ts` for parse/serialize; `lib/bookmarks/og-fetch.ts` for metadata fetching.
- [x] **Tasks view**: CalDAV-compatible local-first task manager (`Ctrl+3`, sidebar "Tasks" with `CheckSquare` icon). `.md` files in `_tasks/` (hidden from Vault/Search, visible in Files) with YAML frontmatter mapping to iCalendar VTODO fields (`uid`, `status`, `priority` 1–4, `due`, `created`, `modified`, `completed`, `tags`, `parent`, `order`). Lists as subfolders. Subtasks as separate `.md` files linked by `parent` UID. Quick-add bar parses natural language (`!1` priority, `#tag`, `>tomorrow`). Two-panel layout: sidebar (Inbox/Today/Upcoming smart filters + user lists) + task list with inline quick-add. Task rows with checkbox, priority dot, due badge, subtask count, tag pills, hover actions. TaskDetailDialog for full editing with subtask management. Completed tasks greyed + struck through, "Clear completed" action. `.ics` export. `useTasksStore` for CRUD; `lib/tasks/` for parse/serialize/tree/date/ical.
- [x] **Kanban boards**: Markdown-based Kanban boards — `.md` files with `type: kanban` in frontmatter render as drag-and-drop boards. Columns are `## Headings`, cards are `- [ ]`/`- [x]` task list items. `detectEditorTabType` peeks at frontmatter when opening `.md` files; `EditorTab.type` includes `'kanban'`. `KanbanEditor` (`components/kanban/kanban-editor.tsx`) renders horizontal scrolling columns with draggable cards (HTML5 DnD). Cards: checkbox, editable title, drag handle, delete on hover. Columns: editable heading, add card input, delete. "Add column" button at end. Auto-save debounced ~750ms. New boards from New File popover ("Kanban", `Columns3` icon, amber accent) with default columns ("To Do", "In Progress", "Done"). `lib/kanban/index.ts` for parse/serialize/create; `types/kanban.ts` for KanbanCard/Column/Board.
- [x] **Accessibility audit**: comprehensive pass across all components — `aria-label` added to all icon-only `ToolBtn` components (note toolbar, PDF toolbar, canvas toolbar), all `<canvas>` elements labeled (`role="application"` where interactive), file tree uses `role="tree"`/`role="treeitem"`/`role="group"` with `aria-expanded`/`aria-selected`/`aria-level`, PDF outline uses tree roles with separated expand/navigate controls (fixes nested `<button>` issue), PDF page panel buttons labeled with `aria-current="page"`, drop zones labeled with `role="region"`, all dialog inputs have `aria-label`, color swatches have human-readable labels, hidden file inputs labeled, TipTap editor surface has `aria-label`/`role="textbox"`

### Completed archive — P4 — UX Overhaul & Missing Features

#### Bugs / Crashes
- [x] **PDF viewer Immer crash**: `store.annotations.splice(0)` mutates frozen Immer state — fixed by using `setDocument()` which resets annotations via `set()`
- [x] **Tiptap paragraph button no-op**: removed — the paragraph button is unnecessary in the toolbar (plain text is the default state); button and its `Pilcrow` import removed from `note-editor-toolbar.tsx`
- [x] **Tiptap list rendering**: Tailwind v4 preflight resets `list-style: none` on all lists — added explicit `list-style-type: disc` for `ul` and `list-style-type: decimal` for `ol` in ProseMirror CSS; also added nested `circle`/`square` styles and `display: list-item` on `li`
- [x] **Tiptap task list formatting error**: TaskItem renders `<label>` + `<div>` inside each `li` — added `flex: 1; min-width: 0` to the `<div>` content wrapper to prevent collapse; styled checkbox with `accent-color`, added checked state strikethrough, fixed `<label>` alignment

#### Architecture / Navigation
- [x] **Unify File Browser + Notes into "Vault" view**: replaced separate "File Browser" and "Notes" sidebar entries with a single **Vault** entry (`ViewMode.Vault`); `VaultView` renders a tab bar — **Preview** (file tree + editor), **Files** (grid/list browser) — plus a **sync-now** icon button when the vault has `sync.provider === 'dropbox'` (calls `triggerFullSync`; disabled until the sync engine is authenticated). Dropbox setup stays under Settings → Sync (`VaultDropboxSyncPanel`). `vaultMode` is persisted per vault path (`ink-vault-layout:<path>`) with legacy fallback `ink-vault-mode`; cross-view navigation targets `ViewMode.Vault` with sub-mode `tree` / `browse`; keyboard shortcut `Ctrl+1` = Vault, `Ctrl+2` = Search, `Ctrl+3` = Graph; `ViewMode.FileBrowser` and `ViewMode.Notes` kept as deprecated aliases that fall through to `VaultView`
- [x] **File browser move/delete UX**: `MoveToFolderDialog` replaces `prompt()` for move; `ConfirmDialog` replaces `window.confirm` for delete (single + batch)
- [x] **New button should be a dropdown, not a view**: replaced sidebar "New" nav entry with a `NewFilePopover` (Radix Popover) anchored to a "New" button at the bottom of the nav; step-1 shows Note / PDF / Drawing type cards; step-2 shows name + folder form + create button; `Enter` key submits; after creation, navigates to `ViewMode.Vault` in the correct sub-mode (tree for notes, browse for PDF/drawing); `Ctrl+N` dispatches `ink:open-new-popover` custom event that the popover listens for; `NewView` is kept for the Templates tab (accessible from future settings)
- [x] **Settings panel**: `SettingsDialog` (Radix Dialog + Tabs) reachable from sidebar "Settings" button and `Ctrl+,`; three tabs — **Vault** (vault name, default new-file folder, template folder), **Editor** (auto-save toggle, save interval, save-on-blur), **Snapshots** (enabled, max per file, retention days); changes buffered locally until "Save changes" is clicked, which calls `saveVaultConfig(vaultFs, draft)` and `updateConfig(draft)` then closes; `VaultConfig` extended with `templateFolder` and `defaultNewFileFolder`; `template-store.ts` functions accept an optional `dir` parameter so the configured folder is respected; `new-file-popover` and `new-view` use `config.defaultNewFileFolder` as the initial folder selection

#### Note Editor
- [x] **Welcome.md not index.md**: `createVault` now writes `Welcome.md` (was `inbox.md`) with frontmatter `title: Welcome` and an `# Welcome` heading
- [x] **Don't insert Welcome.md into existing vaults**: `createVault` now reads the root directory after initialising the `_marrow` structure; if any non-hidden, non-system files are already present it skips writing `Welcome.md` — only truly empty folders get the welcome note
- [x] **Title must match filename 1:1**: fixed two related bugs — (1) after rename the loading `useEffect` re-ran with the new path and read the stale frontmatter `title`, reverting the display; fixed by writing the updated frontmatter (with the new title) to the file *before* the filesystem rename so the reload always sees the correct value; (2) invalid characters caused a confusing reverse-rename on the next edit; fixed by adding `sanitizeTitle()` which strips `/ \ : * ? " < > |` and collapsing whitespace — illegal chars are stripped live on `onChange` and the final sanitized value is committed on blur/Enter; `commitTitleRename` now uses `inlineTitleRef` to avoid stale-closure bugs and Escape reverts using `pathRef.current`

- [x] **Hide tab bar when only one tab is open**: `EditorTabBar` early-returns `null` when `tabs.length <= 1`
- [x] **Auto-focus title on new file**: newly created notes, PDFs, and drawings immediately highlight/select the inline title input so the user can rename without extra clicks — notes use `isNew: boolean` on `EditorTab` (cleared after first focus via `clearNew` store action); PDF/canvas use `newFilePath` state in `FileBrowserView` tied to the pending-path transition; `InlineFileTitle` accepts `autoFocus` + `onFocused` props
- [x] **Wiki-links not resolving (backlinks + graph broken)**: earlier stem logic failed to match `[[My Note]]` to `my-note.md`; fixed with `resolveWikiLinkPath` basename keying (lowercase, strip vault extensions, treat spaces / hyphens / underscores as equivalent) plus partial-path fallback; backlinks scans `raw` for consistency; graph rebuilds on `ink:vault-changed` (`bumpScan`) without a loading flash
- [x] **File tree refresh after new note from popover**: `NewFilePopover` now dispatches `ink:vault-changed` custom DOM event after writing any new file; `NotesViewInner` listens for the event and calls `vaultChanged()` (bumps `treeRefresh` token + refreshes markdown paths), so newly created notes appear in the tree immediately without navigation

#### File Tree / File Browser
- [x] **Product naming — Mentis**: primary UI and metadata use **Mentis**; landing page tagline *an app by Marrow Group*; `manifest.json` / `layout.tsx` title **Mentis**; sidebar and mobile masthead **Mentis**; `public/icon.svg` brain motif (strokes derived from Lucide *Brain*, ISC); Service Worker `CACHE_NAME` → `mentis-marrow-v1`. **Unchanged on purpose:** npm package name `ink-marrow`, `ink-marrow:*` / `ink-theme` storage keys, IndexedDB `ink-marrow`, PDF `InkMarrow` annotation marker (existing files).
- [x] **License (BSL 1.1) + AI notice**: root `LICENSE` is **Business Source License 1.1** (Marrow Group, Mentis, production use permitted via Additional Use Grant, Change Date 2030-04-09, Change License MPL 2.0); `package.json` `license` field; README **License** section + **AI assistance** disclaimer (human review, user responsibility for validation).
- [x] **Drag-and-drop reorder in file tree**: file `TreeNode` items are `draggable` using HTML5 DnD with a custom MIME type `application/x-ink-tree-path`; folder rows are drop targets with a visual ring highlight on `dragOver`; the root tree container is also a drop target (drop there = move to vault root); on drop, `handleMoveFile` calls `vaultFs.rename`, updates the search index, retargets open tabs, and refreshes the tree
- [x] **Rename notes from file tree**: file nodes now support in-place rename — double-click the name or press `F2` to enter edit mode; the pencil button also triggers it; input auto-focuses with full text selected; `Enter`/blur commits (runs `vaultFs.rename`, updates search index + tabs + selection), `Escape` cancels; invalid filename characters are stripped on commit
- [x] **File tree renamed to "Vault", shows all file types**: heading changed from "Notes" to "Vault"; `isNotesTreeEntry` now includes `.pdf` and `.canvas` files (not just `.md`); PDF files show with a red `FileText` icon, canvas files with a violet `Layout` icon; clicking any file opens it inline in the editor area — markdown → `MarkdownNoteEditor`, PDF → `PdfViewer`, canvas → `CanvasEditor`; double-click inline rename restricted to markdown (extension preserved for all types in `handleInlineRename`); Recent section and `recentPaths` prop removed from the file tree; empty-state text updated to "No files yet"
- [x] **Image files in vault tree + centred preview**: `isNotesTreeEntry` includes `FileType.Image` (still hides `_assets/`); tree rows use an `Image` icon; `EditorTab.type` adds `image`; `NotesView` renders `ImagePreviewTabPane` with `ImageEditorView` for PNG/JPEG/WebP (rotate, edge-trim crop, brightness/contrast/saturation, save via `lib/browser/image-edit-pipeline.ts`) and `VaultImageView` for other image types; `lib/notes/editor-tab-from-path.ts` maps vault paths to tab type/title; unit tests for pipeline + helper
- [x] **File browser drag-drop and rename**: files in grid/list file browser are now draggable (HTML5 DnD with `application/x-ink-fb-path` MIME) to folder items as drop targets; inline rename via F2, context menu, or **click on name of selected item** (Finder-like 400ms delayed rename, cancelled by double-click) replaces `window.prompt`; **grid view** uses a column-width `textarea` with word wrap (no overlap into neighbors); newlines stripped on commit; `CARD_HEIGHT` bumped for virtualized rows; **click outside** the rename field commits via capture-phase `blur()` (works even when scroll `pointerdown` uses `preventDefault`); rubber-band on empty-area click is skipped for that same gesture; background drop zone moves files to current folder; sanitizes filenames and updates search index + open tabs on rename/move
- [x] **File browser grid equal column widths**: grid uses `minmax(0, 1fr)` columns to override CSS Grid `min-width: auto` default — prevents long filenames from inflating individual columns and causing unequal card widths
- [x] **External file drop-to-upload**: dragging files from the OS into the file tree or file browser area now auto-imports them into the vault — drop targets include the tree root (imports to vault root), folder nodes (imports into that folder), the file browser scroll area (imports to current folder), and folder items in both grid/list views; native `Files` drag type detected alongside internal DnD MIME types; shows toast with import count

#### Canvas
- [x] **UI Overhaul**: complete Procreate-inspired redesign — toolbar replaced with floating glassmorphism panels (dark semi-transparent `bg-neutral-900/75 backdrop-blur-xl`); bottom-center tool dock with rounded pill shape; top-right floating action bar (undo/redo, export dropdown, save); color picker popover with 24-color palette grid, hex input, opacity slider, and live brush size preview; clean `Pencil` icon replaces `PenTool`; canvas background changed to white
- [x] **Canvas default tool should be pencil**: `activeTool` default changed from `'select'` to `'draw'` in both initial state and `reset()` in `useCanvasStore`; default stroke width bumped to 3 for better feel
- [x] **Canvas drawing improvements**: added `strokeOpacity` (0–1) to store with full UI slider; brush color rendered via `hexToRgba(color, opacity)` for translucent strokes; `PencilBrush.decimate = 2` for smoother curves; fixed critical bug where drawn paths were not tagged with `__nodeId` (erase/delete could orphan strokes); brush size range expanded from 1–20 to 1–50; 24-color palette replaces limited swatch set
- [x] **New canvas should open to edit**: added `pendingCanvasPath` field to `useFileBrowserStore`; `FileBrowserView` watches it and auto-opens the canvas editor; `DrawingForm` (new-file-popover) and `NewCanvas` (new-view) set it after creation and switch to browse mode
- [x] **Inline editable title in canvas editor**: the back-bar header now shows an `InlineFileTitle` input (same style as markdown title) instead of a static filename; editing the title renames the `.canvas` file on blur/Enter; illegal characters stripped in real-time

#### PDF Editor
- [x] **New PDF opens in edit view**: added `pendingPdfPath` to `useFileBrowserStore`; `FileBrowserView` watches it and auto-opens `PdfViewer`; `NewFilePopover` sets the pending path after creation and navigates to browse mode
- [x] **Single-page PDF creation**: `NewFilePopover` now uses `createBlankPdf()` (which creates exactly one A4 page) instead of `PDFDocument.create()` + `insertBlankPage()`; removes the duplicate-page bug with styled (lined/grid/dot) PDFs
- [x] **All PDFs are A4, size option removed**: page size selector removed from the new-file popover; `createBlankPdf` always uses `size: 'a4'`
- [x] **Add page button in PDF toolbar (P9)**: `FilePlus` in `PdfToolbar`; `appendBlankPage` inserts at `getPageCount()` from loaded bytes (avoids stale `pages.length`); `applyPageOp` toasts on failure
- [x] **Inline editable title in PDF viewer**: the back-bar header shows an `InlineFileTitle` input; editing renames the `.pdf` file with the same logic as markdown/canvas titles

#### New-file Popover Simplification
- [x] **Immediate creation, no second dialog**: clicking Note / Drawing creates the file instantly with a date-based default name and opens the editor (note → tree mode, drawing → canvas editor via `pendingCanvasPath`); clicking PDF shows a one-step page-style picker (blank/lined/grid/dot) then creates and opens; no name/folder form — users rename inline from the editor title

#### Graph
- [x] **Graph click = select, double-click = open**: single click selects a node and highlights its neighbourhood (connected nodes + edges at full opacity, everything else dimmed to 20%); selection ring drawn around the selected node; double-click (within 280 ms) opens the file; clicking empty canvas clears selection; drag-to-move nodes still works without accidentally selecting; legend updated
- [x] **Graph shows all vault files as distinct nodes**: `GraphView` now walks the vault directly via `vaultFs.readdir` (replaces broken `useFileTreeStore` approach); all `.md`, `.pdf`, and `.canvas` files become nodes regardless of wiki-link count; `GraphNode` has a new `type: 'note' | 'pdf' | 'canvas'` field; canvas draws distinct shapes per type (circle = note, rounded square = PDF, diamond = drawing) with per-type color schemes (slate/blue, red, violet); clicking a PDF node opens `PdfViewer` via `pendingPdfPath`, clicking a canvas node opens the canvas editor via `pendingCanvasPath`, clicking a note opens a markdown tab; toolbar shows per-type counts; legend updated with shape + color key

#### Templates & New Files
- [x] **New files default to root**: newly created notes/PDFs/canvases go to vault root unless a different default folder is configured in settings — implemented via `useDefaultFolder()` hook reading `config.defaultNewFileFolder`

---

## Phase 2 — Desktop + Sync (Weeks 13–18)

**Status:** Future work — unchecked items below; Phase 1 web MVP is complete.

### Week 13–14: Tauri Desktop Shell
- [ ] Tauri v2 project setup wrapping the Next.js frontend
- [ ] Native file system adapter (TauriAdapter)
- [ ] System tray / menu bar integration
- [ ] Auto-update mechanism
- [ ] Native window management (title bar, fullscreen)
- [ ] File association for `.md`, `.pdf`, `.canvas` files

### Week 15: Templates & Export
- [x] Daily notes: one-tap creation of today's date-titled note
- [ ] Template management: create, edit, delete templates
- [ ] Template variables (date, time, title)
- [x] Export note as PDF (via browser print or pdf-lib)
- [x] Export note as plain `.md` (download from Export → Markdown)

### Week 16: Graph View *(delivered in Phase 1 web — rows kept as history)*
- [x] Graph view of note connections via wiki-links
- [x] Node rendering: one node per note, sized by connection count
- [x] Edge rendering: lines connecting linked notes
- [x] Interactive: click node to open note, drag to rearrange
- [x] Zoom and pan on graph
- [x] Filter graph by folder or tag

### Week 17–18: Cloud Sync (Dropbox)
- [x] `RemoteSyncProvider` interface + shared types (`lib/sync/types.ts`)
- [x] IndexedDB-backed token store (`lib/sync/token-store.ts`)
- [x] IndexedDB-backed sync manifest / state (`lib/sync/sync-state.ts`)
- [x] SHA-256 local change detector (`lib/sync/change-detector.ts`)
- [x] Dropbox provider — HTTP API v2, OAuth 2 PKCE (`lib/sync/providers/dropbox.ts`)
- [x] Nextcloud provider — WebDAV PROPFIND/GET/PUT; Login Flow v2 (popup) + manual app password + OAuth (`lib/sync/providers/nextcloud.ts`)
- [x] `SyncManager` — fullSync (vault open), pushFile (after save), pull (periodic poll), last-write-wins conflict resolution (`lib/sync/sync-manager.ts`)
- [x] `VaultConfig.sync` settings (`types/vault.ts`)
- [x] Settings dialog **Sync** tab — Dropbox remote path, poll interval, connect/disconnect (no separate “enable sync”)
- [x] `SyncProvider` React context + `useSyncPush` hook (`contexts/sync-context.tsx`)
- [x] Sync push hooked into markdown, canvas, and PDF save paths
- [x] Sidebar sync status icon (idle/syncing/error)
- [x] OAuth callback route `/auth/dropbox` — `src/app/auth/dropbox/page.tsx` + `lib/sync/oauth-session.ts`
- [ ] Background poll auto-start on vault open
- [ ] Exclude patterns (`_marrow/snapshots/`, etc.)
- [ ] Conflict toast with "View details" link
- [ ] Bandwidth-aware large file handling

### Week 17–18: Marrow Sync (future proprietary sync)
- [ ] Account system (email + passphrase)
- [ ] CRDT implementation for markdown conflict resolution
- [ ] E2E encryption for sync data
- [ ] Sync service backend (API, storage, auth)
- [ ] Last-write-wins with `.conflict` copy for binary files (PDFs)
- [ ] Pricing tiers and payment integration

---

## Phase 3 — Mobile + Advanced (Weeks 19–26)

**Status:** Future work — unchecked items below.

### Week 19–21: Mobile Shell
- [ ] Capacitor (or Tauri Mobile) project setup
- [ ] Touch-optimized UI (larger tap targets, swipe gestures)
- [ ] Mobile navigation patterns (bottom tabs, slide-over panels)
- [ ] CapacitorAdapter for sandboxed file storage
- [ ] Responsive layout adjustments

### Week 22: Stylus Support
- [ ] Pressure-sensitive drawing on PDF canvas (Apple Pencil, stylus)
- [ ] Pressure-sensitive drawing on unlimited canvas
- [ ] Palm rejection
- [ ] Tilt-based brush angle (where supported)

### Week 23: Share & Capture
- [ ] iOS/Android share sheet integration
- [ ] Capture URLs, images, text into inbox note
- [ ] Quick capture widget

### Week 24: PDF OCR
- [ ] Tesseract.js integration for scanned document text extraction
- [ ] OCR text indexed in MiniSearch for searchability
- [ ] Option for cloud OCR service for higher accuracy

### Week 25: Plugin System
- [ ] Plugin API definition
- [ ] Plugin lifecycle (install, enable, disable, uninstall)
- [ ] Sandboxed plugin execution
- [ ] Community extension marketplace (or sideloading)

### Pre-launch backlog (tracked elsewhere)

User-reported polish and bugs (canvas, PDF, file browser, Vault, mobile export constraints) are logged in **`docs/LAUNCH_DEFERRALS.md`** with IDs (C1, P9, F2, …) for triage before Week 26.

### Week 26: Launch
- [ ] Public launch polish
- [ ] Onboarding flow for new users
- [ ] Marketing site
- [ ] Documentation site
- [ ] App Store / Play Store submissions
