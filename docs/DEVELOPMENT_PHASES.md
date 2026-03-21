# Ink by Marrow — Development Phases

## Phase 1 — Web MVP (Weeks 1–12)

**Goal:** A usable web app with markdown editing, PDF file management, unlimited canvas, and four dedicated views — all in the browser, offline-capable.

### Week 1–2: Foundation

- [ ] Project scaffolding (Next.js, TypeScript, Tailwind, ESLint, Prettier)
- [ ] File system adapter interface + OPFS implementation
- [ ] File System Access API adapter (Chromium)
- [ ] Vault open/create flow
- [ ] `_marrow/` directory bootstrapping (config.json, empty folders)
- [ ] **View Manager** — four-view navigation shell (File Browser, Notes, Search, New)
- [ ] Sidebar navigation component
- [ ] Basic layout: sidebar + main content pane
- [ ] Keyboard shortcut system (Cmd+1/2/3/4 for views)

### Week 3–4: Markdown Editor

- [ ] Tiptap editor integration with ProseMirror
- [ ] Live WYSIWYG markdown rendering
- [ ] Raw source view toggle
- [ ] Frontmatter parsing and display (remark-frontmatter)
- [ ] Basic slash commands (`/` menu): headings, lists, code blocks, dividers
- [ ] Folder tree sidebar for Notes view
- [ ] File create, rename, delete operations
- [ ] Auto-save on debounced changes
- [ ] Tab system for multiple open files

### Week 5: Linking & Navigation

- [ ] Wiki-links `[[...]]` syntax with autocomplete dropdown
- [ ] Backlink panel (shows which notes link to the current note)
- [ ] Starred/pinned notes functionality
- [ ] Recent files tracking and display
- [ ] Note-to-note navigation via wiki-link clicks

### Week 6: Search

- [ ] MiniSearch index initialization on vault open
- [ ] Incremental index updates on file save
- [ ] Search view UI: search bar, results list, grouped by file type
- [ ] Filters: file type (`.md` / `.pdf`), folder, tag, date range
- [ ] Instant-as-you-type results with debouncing
- [ ] Tag extraction and `#tag` support
- [ ] Search result previews with highlighted matches

### Week 7: PDF File Browser

- [ ] File Browser view: grid (thumbnail) and list mode
- [ ] PDF thumbnail generation (PDF.js first-page render)
- [ ] Sort: name, date modified, date added, size, folder
- [ ] Filter: folder, tags
- [ ] Right-click context menu: Open, Move, Rename, Duplicate, Delete
- [ ] Drag-and-drop PDF import with destination picker
- [ ] `_inbox/` folder special handling
- [ ] Batch operations: multi-select, move, delete, tag
- [ ] Import button with system file picker

### Week 8: PDF Viewer & Basic Annotations

- [ ] PDF.js embedded viewer: page navigation, zoom, search-in-document
- [ ] Outline/bookmark sidebar
- [ ] Fabric.js canvas overlay on each visible page
- [ ] Highlight tool: text selection → color picker → `/Highlight` annotation
- [ ] Freehand drawing tool: pen color, thickness, eraser → `/Ink` annotation
- [ ] Destructive write-back via pdf-lib on save
- [ ] Annotation toolbar: Select | Highlight | Draw
- [ ] Existing annotation detection and display as editable objects

### Week 9: Advanced PDF Annotations

- [ ] Signature system: draw on pad or upload image
- [ ] Signature storage in `_marrow/signatures/`
- [ ] Signature placement: draggable, resizable stamp → `/Stamp` on save
- [ ] Text box insertion tool → `/FreeText` annotation
- [ ] Text comment tool → `/Text` popup annotation
- [ ] Auto-save implementation (30s interval + on blur)
- [ ] Snapshot creation on first edit (`_marrow/snapshots/`)
- [ ] Snapshot retention and pruning

### Week 10: PDF Page Management

- [ ] Page panel with all page thumbnails
- [ ] Drag-to-reorder pages
- [ ] Insert blank page (before/after)
- [ ] Delete page
- [ ] Rotate page (90°, 180°, 270°)
- [ ] Merge: drag another PDF into page panel to append
- [ ] Split: extract page range to new PDF
- [ ] Form field detection and filling
- [ ] All operations written to PDF via pdf-lib on save

### Week 11: New View & Canvas Foundation

- [ ] New view UI: three creation paths (Markdown Note, PDF Note, Canvas)
- [ ] New Markdown Note: blank or from template, name + folder picker
- [ ] New PDF Note: page style (blank/lined/grid/dot grid), page size (A4/Letter/Custom)
- [ ] PDF Note creation via pdf-lib with styled backgrounds
- [ ] Template management UI in `_marrow/templates/`
- [ ] **Unlimited Canvas**: Fabric.js infinite surface with pan and zoom
- [ ] Freehand drawing on canvas with pressure sensitivity
- [ ] Text cards: resizable text blocks with basic markdown formatting
- [ ] Image embeds: drag-and-drop onto canvas

### Week 12: Canvas Features & Polish

- [ ] Canvas connectors: arrows/lines between objects
- [ ] Sticky notes: colored blocks for quick ideas
- [ ] Sections/frames: group canvas regions for presentation
- [ ] Canvas export to PDF/PNG
- [ ] Canvas auto-save to `.canvas` JSON
- [ ] Canvas cross-linking via `[[wiki-links]]`
- [ ] Service Worker for offline caching (Workbox)
- [ ] Performance optimization pass
- [ ] Bug fixes and UI polish
- [ ] Keyboard shortcuts documentation
- [ ] PWA manifest and icons

### Phase 1 Exit Criteria

A user can:
- ✅ Create and open a vault
- ✅ Navigate via four views (File Browser, Notes, Search, New)
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

## Phase 2 — Desktop + Sync (Weeks 13–18)

### Week 13–14: Tauri Desktop Shell
- [ ] Tauri v2 project setup wrapping the Next.js frontend
- [ ] Native file system adapter (TauriAdapter)
- [ ] System tray / menu bar integration
- [ ] Auto-update mechanism
- [ ] Native window management (title bar, fullscreen)
- [ ] File association for `.md`, `.pdf`, `.canvas` files

### Week 15: Templates & Export
- [ ] Daily notes: one-tap creation of today's date-titled note
- [ ] Template management: create, edit, delete templates
- [ ] Template variables (date, time, title)
- [ ] Export note as PDF (via browser print or pdf-lib)
- [ ] Export note as HTML
- [ ] Export note as plain `.md`

### Week 16: Graph View
- [ ] Graph view of note connections via wiki-links
- [ ] Node rendering: one node per note, sized by connection count
- [ ] Edge rendering: lines connecting linked notes
- [ ] Interactive: click node to open note, drag to rearrange
- [ ] Zoom and pan on graph
- [ ] Filter graph by folder or tag

### Week 17–18: Marrow Sync
- [ ] Account system (email + passphrase)
- [ ] CRDT implementation for markdown conflict resolution
- [ ] E2E encryption for sync data
- [ ] Sync service backend (API, storage, auth)
- [ ] Last-write-wins with `.conflict` copy for binary files (PDFs)
- [ ] Sync status indicators in UI
- [ ] Pricing tiers and payment integration

---

## Phase 3 — Mobile + Advanced (Weeks 19–26)

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

### Week 26: Launch
- [ ] Public launch polish
- [ ] Onboarding flow for new users
- [ ] Marketing site
- [ ] Documentation site
- [ ] App Store / Play Store submissions
