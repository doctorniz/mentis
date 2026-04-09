# Mentis — Architecture

## 1. High-Level Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                            Mentis                                   │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ ┌────────────┐  │
│  │  Markdown     │ │  PDF Engine  │ │  Canvas     │ │  View      │  │
│  │  Editor       │ │              │ │  Engine     │ │  Manager   │  │
│  │  (Tiptap /    │ │  (PDF.js +   │ │             │ │            │  │
│  │  ProseMirror) │ │  pdf-lib +   │ │  (Fabric.js)│ │  File      │  │
│  │              │ │  Fabric.js)  │ │             │ │  Browser,  │  │
│  │              │ │              │ │             │ │  Notes,    │  │
│  │              │ │              │ │             │ │  Search,   │  │
│  │              │ │              │ │             │ │  New       │  │
│  └──────┬───────┘ └──────┬───────┘ └──────┬──────┘ └─────┬──────┘  │
│         │                │                │              │          │
│  ┌──────┴────────────────┴────────────────┴──────────────┴───────┐  │
│  │                    Core Data Layer                             │  │
│  │  ┌──────────┐  ┌───────────┐  ┌──────────────────┐            │  │
│  │  │ File I/O │  │ Search    │  │ Snapshot Manager │            │  │
│  │  │ Adapter  │  │ Index     │  │ (version safety  │            │  │
│  │  │          │  │ (MiniSearch│  │  net for PDFs)   │            │  │
│  │  │          │  │  / Lunr)  │  │                  │            │  │
│  │  └──────────┘  └───────────┘  └──────────────────┘            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │             Platform Adapter                                   │  │
│  │   Web: OPFS / File System Access API                           │  │
│  │   Desktop (Tauri): Native FS                                   │  │
│  │   Mobile (Capacitor/Tauri): Sandboxed FS                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

## 2. Layer Responsibilities

### 2.1 Presentation Layer

Four dedicated views, each with their own layout and feature set:

| Module | Responsibility |
|---|---|
| **View Manager** | Top-level router. Manages the primary views (Vault, Search, Graph, New) and editor panes. **Vault** combines tree + browse layouts behind an emoji-only segmented control (🌳 / 🗂️). **Desktop (≥768px):** `MainSidebar` shows Vault / Search / Graph, New popover, theme, Settings, Close vault. **Narrow viewports (≤767px, `MOBILE_NAV_MEDIA_QUERY` in `lib/browser/breakpoints.ts`):** the main sidebar is hidden; `MobileNavMasthead` in `app-shell.tsx` shows a hamburger that opens a left sheet with **New** first (inline accordion — tap expands Note / File / Drawing sub-items), then Vault / Search / Graph, then theme / Settings / Close vault. Note and Drawing create immediately and close the drawer; File opens a native file picker for import. **Ctrl+N** opens the sheet (and auto-expands the New accordion) on narrow viewports; the desktop `MainSidebar` `NewFilePopover` disables the global shortcut listener while narrow so a hidden trigger does not open a stray popover. Creation logic is shared via `useNewFileActions` hook (`lib/notes/use-new-file-actions.ts`). Handles sidebar navigation, keyboard shortcuts, and view transitions. **Image** files in the tree (see `isNotesTreeEntry`) open as `EditorTab` type `image`. **PNG / JPEG / WebP:** `ImageEditorView` (`components/notes/image-editor-view.tsx`) — canvas pipeline in `lib/browser/image-edit-pipeline.ts` (rotate, edge-trim crop, brightness/contrast/saturation, save overwrites vault file, evicts `image-thumbnail` cache). **GIF, SVG, BMP, ICO:** plain preview via `VaultImageView`. `lib/notes/editor-tab-from-path.ts` maps paths to tab type/title. |
| **Markdown Editor** | Tiptap/ProseMirror WYSIWYG plus optional **Source** toggle (raw `.md`). Wiki-links (`[[note]]` / `[[note|alias]]`): inline node, `[[` autocomplete (Suggestion), click navigates via `resolveWikiLinkPath`. Slash commands, debounced save. **Mode bar** (compact): icon-only Visual / Source segment; icon + chevron opens Radix dropdown — **Markdown** downloads `.md` (`downloadTextFile`), **Print** opens browser print with styled HTML (`buildExportHtml` + `printExportHtml`, save as PDF from the dialog). Embedded PDF page nodes in-editor remain planned. |
| **File Browser** | Grid/list view of vault files. Sort (name/date/size/type), type filters, right-click context menu (Open/Rename/Duplicate/Move/Delete), batch multi-select, drag-and-drop import zone, `_inbox/` shortcut. PDF thumbnail via PDF.js first-page render (blob URL cache in `lib/pdf/thumbnail.ts`). Image thumbnails via blob URL cache in `lib/file-browser/image-thumbnail.ts` (grid: 56×56 rounded; list: 20×20 inline). |
| **PDF Engine** | PDF.js renders pages into `<canvas>` elements; Fabric.js overlays handle highlight rectangles, freehand ink paths, editable text boxes (FreeText), comment markers (`PdfTextComment`), and signature stamps (Stamp). **Comments (P6/P7):** Comment tool sets `pendingPdfComment` in `usePdfStore`; `PdfCommentDialog` (Radix) collects text; `PdfPageCommentRail` lists per-page comments beside the page (Word-like margin). **Persistence:** `annotation-writer.ts` draws highlights, ink, FreeText, and stamps into page **content**; **text comments** are written as native `/Text` annotations (`Contents`, `NM`, custom `InkMarrow` for idempotent saves). `annotation-reader.ts` hydrates `/Highlight`, `/Ink`, and `/Text` via `getAnnotations`; loader uses `addAnnotation(..., { fromLoader: true })` so the doc is not marked unsaved. After autosave the viewer reloads file bytes so the raster layer matches disk. `PdfToolbar` manages Select/Highlight/Draw/Text/Comment/Sign modes (Text tool hint strip; **P14** separate swatches: `highlightColor`, `drawColor`, `textColor` in `usePdfStore`), stroke width, zoom, page nav, signature picker, form dialog, **find-in-document** (`search-pdf-text.ts`, pdf.js `getTextContent`, canvas overlays), and **Undo/Redo** for page operations. Save and Flatten buttons have been removed (autosave uses vault `autoSave`, default 5s interval + optional blur); the Side Panel toggle is also removed (the side column has its own expand/collapse rail). **Undo/Redo:** `PdfUndoStack` (`lib/pdf/undo-stack.ts`) stores up to 20 snapshots of raw PDF bytes; `applyPageOp` pushes pre-operation bytes before each transform; `Ctrl+Z` / `Ctrl+Shift+Z` keyboard shortcuts are wired at the viewer level. **Side column (`PdfSideColumn`):** a single collapsible left column with two tabs — **Pages** (default, page thumbnails via `PdfPagePanel`) and **Outline** (`PdfOutlineContent` tree). Collapsed: slim `w-9` rail with Layers icon to re-expand. Auto-collapses when `pages.length <= 1` (e.g. a new blank PDF). Outline reads the PDF bookmark tree for navigation. `SignaturePadDialog` lets users draw or upload signatures stored in `_marrow/signatures/index.json`. Placing a stamp switches to **Select**; `object:modified` writes `Stamp` `rect` back to the store so moves/scales persist on save. Auto-save uses `VaultConfig.autoSave` (`intervalMs`, default 5s; `saveOnBlur`; can be disabled in Settings); `PdfViewer` reads it from `useVaultStore`. A snapshot is created on first edit via `lib/snapshot`. **Pen / ink:** Fabric pencil paths are simplified to M/L/Q/C/Z; `fabric-path-to-pdf-points.ts` expands curves to polylines so `annotation-writer` always receives enough points for `drawLine`. **Page management**: toolbar **Add page** calls `appendBlankPage` so the insert index comes from pdf-lib `getPageCount()` on current bytes (avoids stale React `pages.length`). `PdfPagePanel` displays draggable thumbnails with **multi-select** (Ctrl/Cmd+click toggles, Shift+click selects range); selected pages show accent tint + badge, and a **Save** icon appears in the toolbar to extract them into a new PDF (opens as a new tab via `extractPages`). Operations (insert blank, delete, rotate, reorder, merge) go through `lib/pdf/page-operations.ts` which uses pdf-lib's `copyPages`/`removePage`/`insertPage`/`setRotation`. `PdfFormDialog` uses `getFormFields` (returns `[]` if none or unreadable — P10); fills via `setText`/`check`/`select` when fields exist. |
| **Canvas Engine** | `CanvasEditor` wraps Fabric.js in an infinite-pan, wheel-zoom surface (0.1×–5×). Tools: Select/Pan, Draw (`PencilBrush`), Text (`FabricTextbox`), Sticky (`FabricRect` + text), Image (`FabricImage` from file picker), Connect (click two nodes → arrow `FabricLine`+`FabricTriangle`), Erase, frame sections in saved files, and `[[wiki-link]]` card nodes. After the `.canvas` file loads asynchronously, tool mode is re-applied on all Fabric objects so the active tool matches the toolbar (draw vs select). Placing text or sticky body text switches to Select and opens editing; a **text formatting** strip on `CanvasToolbar` (bold, italic, underline, size, font family, color) appears when a formattable `FabricTextbox` is selected; basic styles persist on `CanvasTextNode` in JSON. Keyboard shortcuts (V/P/T/N/C/E, Delete). Auto-save ~3 s interval + visibility/blur + flush before inline rename. Export to PNG (2× `toDataURL`) or PDF (pdf-lib `embedPng`). `CanvasToolbar` + `useCanvasStore` manage tools and stroke UI. `.canvas` JSON stores `nodes`, `edges`, and `frames`. |
| **Graph View** | Interactive force-directed visualization of note connections. `buildNoteGraph` scans all markdown files for wiki-links and builds a node+edge model. `GraphCanvas` renders via Canvas 2D with drag, pan, zoom, and click-to-open. Filter by folder dropdown. No external dependencies. |
| **New View** | Tabbed creation screen with Markdown Note (name, folder picker, template), PDF Note (style, size → pdf-lib), Canvas, and Template Manager tabs. Templates stored in `_marrow/templates/`. **New file popover** (Ctrl+N / sidebar): Note, File, Drawing — no subtitles. File opens upload screen (drop zone + Browse) for importing into default folder; "Create blank PDF" shortcut uses `VaultConfig.pdfPageStyle` (Blank/Lined/Grid, configurable in Settings > Vault). |

### 2.2 Core Data Layer

| Module | Responsibility |
|---|---|
| **File I/O Adapter** | Abstract interface for filesystem operations (read, write, list, move, delete, watch). Implementations: `OpfsAdapter`, `FsapiAdapter`, `TauriAdapter`, `CapacitorAdapter`. |
| **Search Index** | MiniSearch in `src/lib/search/` indexes markdown title/body (length-capped), flattened tags (`#tag` + YAML `tags`), and PDF/canvas titles/paths. Full rebuild when the vault opens (`VaultSearchBootstrap`); incremental `upsert` on markdown save/rename. Search view runs debounced queries, optional filters, and match snippets. |
| **Snapshot Manager** | Creates and manages PDF version snapshots in `_marrow/snapshots/`. Handles retention policies (max per file, retention days) and pruning. |
| **Vault Manager** | Manages vault lifecycle: open, create, switch, close. Reads `_marrow/config.json` for settings. Exposes vault metadata (name, path, stats). |

### 2.3 Platform Adapter Layer

Abstracts platform-specific file system access behind a common interface.

| Platform | Adapter | Notes |
|---|---|---|
| **Web (Chromium)** | `FsapiAdapter` | File System Access API for "open folder" vault access. Full read/write to user's chosen directory. **Persistence:** `FileSystemDirectoryHandle` stored in IndexedDB (`lib/fs/handle-store.ts`); on reload, `queryPermission` restores silently if already granted, otherwise a "Reconnect" prompt appears on the landing page. |
| **Web (fallback)** | `OpfsAdapter` | Origin Private File System. Works in all modern browsers including Safari. Vault lives in browser-managed storage. |
| **Desktop** | `TauriAdapter` | Tauri v2 FS plugin. Direct native filesystem access. |
| **Mobile** | `CapacitorAdapter` | Capacitor Filesystem plugin. Sandboxed storage with cloud sync integration points. |

## 3. Vault File Structure

```
my-vault/
├── _marrow/                    # App metadata (hidden from note tree)
│   ├── config.json             # Vault settings, theme, preferences
│   ├── signatures/             # Saved signature images
│   ├── templates/              # Note templates
│   ├── search-index.json       # Cached full-text search index
│   └── snapshots/              # Auto-saved PDF version snapshots
│
├── _inbox/                     # PDF import landing zone
│
├── Projects/                   # User folders
│   ├── Project Alpha/
│   │   ├── overview.md
│   │   ├── contract.pdf
│   │   ├── brainstorm.canvas
│   │   └── _assets/
│   │       └── diagram.png
│   └── Project Beta/
│       └── notes.md
│
├── Journal/
│   ├── 2026-03-20.md
│   └── 2026-03-19.md
│
└── inbox.md                    # Default capture note
```

### Reserved Directories

| Directory | Purpose | Hidden from UI tree |
|---|---|---|
| `_marrow/` | App metadata, config, templates, snapshots, signatures | Yes |
| `_inbox/` | PDF import landing zone | No (shown as special folder) |
| `_assets/` | Per-folder asset storage for embedded images/files | Yes (assets shown inline in notes) |

## 4. Destructive PDF Write Model

### Write Lifecycle

1. **Open** — PDF.js renders the file. Existing standard PDF annotations are detected and displayed as editable Fabric.js objects on the canvas overlay.
2. **First edit** — Before the first mutation in a session, Mentis copies the current PDF to `_marrow/snapshots/<filename>_<ISO-timestamp>.pdf`.
3. **Edit** — User highlights, draws, signs, adds text boxes, reorders pages. Changes are held in memory on the Fabric.js canvas layer.
4. **Persist** — On auto-save (`VaultConfig.autoSave`: interval, default 5s; optional window blur; can be disabled in Settings), `pdf-lib` loads the current PDF bytes, `writeAnnotationsIntoPdf` applies them (highlights / ink / FreeText / stamps drawn into **content**; text comments as native `/Text` with `InkMarrow`), then bytes are written back to the file system. There is no PDF-specific **Save** button in `PdfToolbar` (canvas and Settings still use **Ctrl/Cmd+S** for their own save actions).
5. **Close** — Any unsaved changes are flushed. The file on disk is fully up to date.

### Annotation Type Mapping

| Mentis feature | PDF Annotation Type | Standard |
|---|---|---|
| Highlight | Drawn into page content (visual parity with `/Highlight`) | — |
| Freehand drawing | Drawn into page content (visual parity with `/Ink`) | — |
| Text comment | Native `/Text` (`InkMarrow` for strip on save) | PDF 1.7 §12.5.6.4 |
| Text box | Drawn text (visual parity with FreeText) | — |
| Signature | Drawn image (visual parity with stamp) | — |

### Snapshot Configuration

```json
{
  "snapshots": {
    "enabled": true,
    "maxPerFile": 5,
    "retentionDays": 30
  }
}
```

### Write Safety

- Write to a temp file first, then atomic rename to prevent corruption on interrupted writes.
- Snapshot created before first edit provides rollback safety net.
- Oldest snapshots beyond `maxPerFile` or `retentionDays` are pruned on vault open.

## 5. Data Flow Diagrams

### 5.1 Markdown Note Lifecycle

**Implemented (Phase 1, Notes view):** wiki `[[links]]` are rewritten to `<span data-type="wiki-link">` before **marked** runs; **turndown** has a custom rule to emit `[[…]]` again. Load uses **marked** → **@tiptap/html** `generateJSON` → `setContent`; save uses **@tiptap/html** `generateHTML` → **turndown** for the note body, then **gray-matter** (`serializeNote`) to merge YAML frontmatter before `vaultFs.writeTextFile`. **Source** mode edits the full `.md` string in a textarea (including YAML); switching back to **Visual** parses with **gray-matter** and reloads the body into Tiptap. **NotesWorkspaceProvider** refreshes a vault-wide list of `.md` paths for wiki completion and backlinks. **Notes file tree (left column)** is collapsible: header control collapses to a slim folder rail; tap the rail to expand. At ≤767px the tree defaults collapsed on load and when crossing that breakpoint; expanding uses a left overlay + scrim (same idea as backlinks on narrow). **BacklinksPanel** (right column) is collapsible: at viewport width ≤1024px it starts collapsed as a slim rail (link icon + count); expanding opens an overlay above the editor with a scrim to dismiss. **Resizing** the window into the narrow backlinks breakpoint auto-collapses the backlinks panel to the rail (so an open overlay does not stay open on a too-narrow width). Wider viewports start expanded with a fixed-width column; the header chevron collapses to the same rail. **remark/unified** remains planned for search indexing and richer transforms.

```
User types in editor
        │
        ▼
Tiptap ProseMirror state update
        │
        ▼
Debounced body → Markdown (turndown) + frontmatter (gray-matter)
        │
        ▼
File I/O Adapter.writeTextFile(path, full .md)
        │
        ▼
Platform FS writes to disk (OPFS vault)
        │
        ▼
Search index upsert on markdown save / rebuild on vault open   ← implemented (PDF body text ← planned)
```

### 5.2 PDF Annotation Lifecycle

```
User draws/highlights/signs on PDF
        │
        ▼
Fabric.js canvas captures objects
        │
        ▼
Auto-save timer fires (vault `autoSave.intervalMs`, default 5s / optional blur)
        │
        ▼
Snapshot Manager: create snapshot if first edit
        │
        ▼
pdf-lib: load PDF bytes → write annotations → serialize
        │
        ▼
File I/O Adapter.write(path, pdfBytes)
        │
        ▼
Platform FS writes to disk
```

### 5.3 Canvas Lifecycle

```
User interacts with canvas (draw/add card/connect)
        │
        ▼
Fabric.js canvas state
        │
        ▼
Serialize to .canvas JSON format
        │
        ▼
File I/O Adapter.write(path, canvasJson)
        │
        ▼
Platform FS writes to disk
```

## 6. Module Dependency Graph

```
View Manager (AppShell → ViewRouter → 4 views)
├── Markdown Editor
│   ├── Tiptap / ProseMirror
│   ├── marked + turndown + gray-matter (markdown ↔ HTML ↔ Tiptap JSON)
│   ├── File I/O Adapter
│   └── Search Index
├── PDF Engine
│   ├── PDF.js (rendering)
│   ├── Fabric.js (annotation overlay)
│   ├── pdf-lib (write-back)
│   ├── File I/O Adapter
│   ├── Snapshot Manager
│   └── Search Index
├── Canvas Engine
│   ├── Fabric.js (infinite canvas)
│   ├── File I/O Adapter
│   └── Search Index
├── File Browser View
│   ├── File I/O Adapter
│   └── Search Index
├── Notes View
│   ├── File I/O Adapter
│   └── Search Index
├── Search View
│   └── Search Index
└── New View
    ├── File I/O Adapter
    └── pdf-lib (new PDF creation)
```

## 7. State Management

**Zustand** stores, organized by domain:

| Store | Responsibility |
|---|---|
| `useVaultStore` | Current vault state, config, vault path |
| `useFileTreeStore` | File/folder tree structure, selection state |
| `useEditorStore` | Active editor state, open tabs, unsaved changes |
| `usePdfStore` | Current PDF state, annotations, page info |
| `useCanvasStore` | Current canvas objects, viewport, tools, dirty flag |
| `useSearchStore` | Search query, results, filters |
| `useFileBrowserStore` | Browser view mode, sort, filter, multi-select |
| `useUiStore` | View mode, sidebar state, theme, modals |

## 8. Performance Strategy

| Concern | Strategy |
|---|---|
| Large vault (10k+ files) | Lazy file tree loading. Virtualized lists. Incremental search indexing. |
| Large PDFs | Lazy page rendering (visible + 1 adjacent). PDF.js Web Worker. |
| Canvas with many objects | Fabric.js object caching. Viewport culling. Level-of-detail rendering. |
| Search responsiveness | MiniSearch with pre-built index. Debounced incremental updates. |
| Memory management | Release PDF page canvases when scrolled out of view. LRU cache for thumbnails. |
| Startup time | Service Worker caches app shell. Search index loaded async. File tree loaded progressively. |

## 9. Security Considerations

| Concern | Mitigation |
|---|---|
| File system access scope | FSAPI requires user gesture to grant access. OPFS is sandboxed by origin. |
| PDF file integrity | Write to `.__ink_tmp`, verify `%PDF-` header, then rename. Pre-edit snapshots. Load-time header check logs corruption. |
| Storage persistence | `navigator.storage.persist()` called on vault open to prevent OPFS eviction. FSAPI `FileSystemDirectoryHandle` persisted in IndexedDB; cleared on close-vault. |
| Unsaved changes | `beforeunload` guard checks dirty tabs, PDF, and canvas stores. Canvas flushes on unmount. |
| Runtime crashes | `ErrorBoundary` wraps AppShell; shows recovery UI ("Try Again" / "Reload") instead of blank screen. |
| Cross-origin content | PDF.js sandboxes rendering. No external resource loading in notes. |
| Vault encryption (Phase 2) | Marrow Sync uses E2E encryption. Local vault encryption is a Phase 3 consideration. |
