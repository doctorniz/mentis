# Mentis — Product Requirements Document

*An app by Marrow Group.*

## 1. Vision

Mentis is a cross-platform note-taking application built on a **local-first, markdown-file architecture**. It treats the filesystem as the source of truth — every note is a `.md` file, every asset lives alongside it, and the user always owns their data. On top of this foundation, Mentis is also a **full-featured PDF file browser and editor**: import, create, organise, annotate, highlight, sign, and manage PDFs as first-class citizens. All PDF edits are written directly into the file — one file, one source of truth, no sidecar layers.

**Web-first**, then native.

---

## 2. Core Principles

| Principle | Description |
|---|---|
| **File-over-database** | Notes are `.md` files on disk (or synced storage), not rows in a proprietary database. Users can open their vault in any text editor. |
| **Offline-capable** | The web app works without a connection. Native apps work natively. |
| **Destructive PDF workflow** | Annotations, highlights, signatures, and drawings are written directly into the PDF file. One file = one source of truth. No sidecar files, no overlay layers. |
| **PDF as first-class citizen** | Mentis is also a PDF file browser and manager. Import, create, organise, annotate, sign, and export PDFs with the same fluency as markdown notes. |
| **Progressive complexity** | A new user writes a note in 3 seconds. Power features reveal themselves gradually. |

---

## 3. Feature Breakdown

### 3.1 Markdown Notes (Core)

- **Live editor**: WYSIWYG-style editing that renders markdown in-place (Typora/Obsidian style). Toggle to raw source view.
- **File tree sidebar**: Browse, search, create, rename, move, and delete `.md` files and folders.
- **Frontmatter support**: YAML frontmatter for metadata — tags, created/modified dates, custom fields.
- **Wiki-links**: `[[note-name]]` linking between notes with backlink tracking.
- **Slash commands**: `/` menu for inserting headings, tables, code blocks, callouts, checkboxes, images, embeds.
- **Tags & search**: `#tag` support. Full-text search across the vault with instant results.
- **Templates**: User-defined `.md` templates for meeting notes, journals, project briefs, etc.
- **Image & file embeds**: Drag-and-drop images/files. Stored in an `_assets/` folder relative to the note.
- **Embedded PDF pages**: `![[file.pdf#page=3]]` renders a specific PDF page inline within the note. Supports page ranges: `![[file.pdf#page=3-5]]`.
- **Markdown extensions**: GFM tables, task lists, math (KaTeX), footnotes, callout blocks.
- **Export**: Export note as PDF, HTML, or plain `.md`.

### 3.2 PDF File Browser & Manager

- **PDF library view**: Dedicated view showing all PDFs in the vault — grid (thumbnail) or list mode. Sort by name, date modified, size, folder.
- **Import**: Drag-and-drop or file picker to import external PDFs into the vault.
- **Quick Look / preview**: Hover or single-click for thumbnail preview and metadata.
- **Batch operations**: Multi-select PDFs to move, delete, tag, or merge.
- **PDF inbox**: A dedicated `_inbox/` folder for newly imported PDFs.

### 3.3 PDF Editing & Annotation (Destructive)

All edits written directly into the PDF file on save.

- **PDF Viewer**: Page navigation, zoom, search-in-document, outline/bookmark sidebar.
- **Highlighting**: Select text → choose color. Written as standard PDF `/Highlight` annotation.
- **Freehand annotation**: Draw/write on pages. Pen color, thickness, eraser. Stamped into PDF on save.
- **Text comments**: Pin a comment to a specific region of a page.
- **Text box insertion**: Place editable text boxes anywhere on a page.
- **Signatures**: Create, save, and place reusable signatures. Embedded into the PDF.
- **Form filling**: Detect and fill interactive PDF form fields.
- **Page management**: Insert, delete, reorder, and rotate pages.
- **Merge & split**: Combine multiple PDFs or extract page ranges.
- **New PDF note**: Create a blank PDF canvas (lined, grid, dot grid, or blank pages).
- **Export**: Download as-is or flatten (removes annotation editability).
- **Auto-save**: Configurable interval (default 5s and on blur; overridable in Settings).
- **Version snapshots**: Pre-edit safety copies in `_marrow/snapshots/`.

### 3.4 App Views

| View | Description |
|---|---|
| **Vault (browse)** | Grid/list file browser: sort, filter, batch operations, move/delete modals, inbox. |
| **Vault (tree)** | Folder tree + inline editors for markdown, PDF, and canvas; starred paths; no separate “Notes” nav label. |
| **Search** | Full-text search across vault. Results grouped by file type with filters. |
| **New** | Quick-create launcher for Markdown Note, PDF Note, or Unlimited Canvas. |

### 3.5 Unlimited Canvas

Freeform, infinitely scrollable whiteboard:
- Infinite surface with pan and zoom
- Freehand drawing with pressure sensitivity
- Text cards, image embeds, sticky notes
- Connectors between objects
- Sections/frames for grouping
- Export to PDF/PNG
- Saved as `.canvas` JSON file
- Cross-linking via `[[wiki-links]]`

### 3.6 Cross-Platform Sync (Phase 2+)

- **Filesystem sync**: Point vault at cloud-synced folder (iCloud, Dropbox, Google Drive, OneDrive).
- **Marrow Sync** (optional): Proprietary encrypted sync service using CRDTs.
- **Conflict handling**: Last-write-wins with `.conflict` copies (filesystem) or CRDT merge (Marrow Sync).

---

## 4. Success Metrics (Phase 1)

| Metric | Target |
|---|---|
| Time to first note | < 5 seconds from app load |
| Vault size supported | 10,000+ notes without degradation |
| PDF open time (50-page doc) | < 2 seconds |
| PDF save time (50-page annotated doc) | < 3 seconds |
| PDF browser thumbnail generation | < 500ms per PDF |
| Lighthouse PWA score | > 90 |
| Offline functionality | Full read/write without network |
| Cross-viewer compatibility | Annotations readable in Acrobat, Preview, Chrome |

---

## 5. Data & Privacy

- **Local-first by default.** No account required. No data leaves the device unless user opts into Marrow Sync.
- **Marrow Sync encryption.** End-to-end encrypted. Server stores opaque blobs.
- **No telemetry without consent.** Optional, anonymized usage analytics (opt-in).
- **Export everything.** Users can copy their vault folder and walk away. No lock-in.

---

## 6. Open Questions

1. Default view on vault open — single view or combined "Home" dashboard?
2. Canvas file format — Obsidian-compatible `.canvas` JSON or custom format?
3. Canvas real-time collaboration (Phase 2+)?
4. Monetization model — free core + paid sync, or freemium with feature gating?
5. Naming — "Vault" vs "Notebook" vs "Library" vs "Workspace"?
