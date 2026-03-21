# Ink by Marrow — Architecture

## 1. High-Level Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         Ink by Marrow                               │
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
| **View Manager** | Top-level router. Manages the four primary views (File Browser, Notes, Search, New) and the editor panes. Handles sidebar navigation, keyboard shortcuts, and view transitions. |
| **Markdown Editor** | Tiptap/ProseMirror-based rich text editor. Loads `.md` files, renders WYSIWYG, and serializes back to markdown on save. Hosts slash commands, wiki-link autocomplete, and embedded PDF page nodes. |
| **PDF Engine** | Combines PDF.js (rendering), Fabric.js (annotation overlay), and pdf-lib (write-back). Manages the viewer toolbar, annotation tools, page panel, and auto-save lifecycle. |
| **Canvas Engine** | Fabric.js-powered infinite whiteboard. Handles freehand drawing, text cards, sticky notes, images, connectors, frames. Serializes to/from `.canvas` JSON. |

### 2.2 Core Data Layer

| Module | Responsibility |
|---|---|
| **File I/O Adapter** | Abstract interface for filesystem operations (read, write, list, move, delete, watch). Implementations: `OpfsAdapter`, `FsapiAdapter`, `TauriAdapter`, `CapacitorAdapter`. |
| **Search Index** | MiniSearch-powered full-text search. Indexes markdown content, frontmatter, tags, and PDF filenames. Rebuilt on vault open, incrementally updated on file changes. |
| **Snapshot Manager** | Creates and manages PDF version snapshots in `_marrow/snapshots/`. Handles retention policies (max per file, retention days) and pruning. |
| **Vault Manager** | Manages vault lifecycle: open, create, switch, close. Reads `_marrow/config.json` for settings. Exposes vault metadata (name, path, stats). |

### 2.3 Platform Adapter Layer

Abstracts platform-specific file system access behind a common interface.

| Platform | Adapter | Notes |
|---|---|---|
| **Web (Chromium)** | `FsapiAdapter` | File System Access API for "open folder" vault access. Full read/write to user's chosen directory. |
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
2. **First edit** — Before the first mutation in a session, Ink copies the current PDF to `_marrow/snapshots/<filename>_<ISO-timestamp>.pdf`.
3. **Edit** — User highlights, draws, signs, adds text boxes, reorders pages. Changes are held in memory on the Fabric.js canvas layer.
4. **Save** — On auto-save trigger (blur, interval, or manual Cmd+S), `pdf-lib` loads the current PDF bytes, writes all pending annotations as standard PDF annotation objects, and writes modified bytes back to the file system.
5. **Close** — Any unsaved changes are flushed. The file on disk is fully up to date.

### Annotation Type Mapping

| Ink Feature | PDF Annotation Type | Standard |
|---|---|---|
| Highlight | `/Highlight` | PDF 1.7 §12.5.6.10 |
| Freehand drawing | `/Ink` | PDF 1.7 §12.5.6.13 |
| Text comment | `/Text` (popup note) | PDF 1.7 §12.5.6.4 |
| Text box | `/FreeText` | PDF 1.7 §12.5.6.6 |
| Signature | `/Stamp` (embedded image) | PDF 1.7 §12.5.6.12 |

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

```
User types in editor
        │
        ▼
Tiptap ProseMirror state update
        │
        ▼
Debounced serialize to Markdown (remark/unified)
        │
        ▼
File I/O Adapter.write(path, markdown)
        │
        ▼
Platform FS writes to disk
        │
        ▼
Search Index.update(path, content)
```

### 5.2 PDF Annotation Lifecycle

```
User draws/highlights/signs on PDF
        │
        ▼
Fabric.js canvas captures objects
        │
        ▼
Auto-save timer fires (30s / blur / Cmd+S)
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
View Manager
├── Markdown Editor
│   ├── Tiptap / ProseMirror
│   ├── remark / unified (markdown parsing)
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
| `useCanvasStore` | Current canvas objects, viewport position |
| `useSearchStore` | Search query, results, filters |
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
| PDF file integrity | Temp file + atomic rename on write. Pre-edit snapshots. |
| Cross-origin content | PDF.js sandboxes rendering. No external resource loading in notes. |
| Vault encryption (Phase 2) | Marrow Sync uses E2E encryption. Local vault encryption is a Phase 3 consideration. |
