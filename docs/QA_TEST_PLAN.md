
MENTIS BY MARROW
Comprehensive QA Test Plan
Full-Feature Review • Edge Cases • Stress Tests

Generated: April 21, 2026
Local-First PKM • Offline-Capable PWA • BSL 1.1
 
Table of Contents

1. Vault & File System
1.1  Vault Creation & Opening
1.2  File CRUD Operations
1.3  Auto-Save Behavior
1.4  Snapshots / Version History
1.5  Vault Structure Integrity
2. Navigation & Views
2.1  View Switching
2.2  Sidebar & Layout
2.3  Mobile Responsiveness (≤767px)
2.4  Theme & Appearance
3. Markdown Editor
3.1  Slash Commands
3.2  Inline Formatting
3.3  Wiki-Links & Navigation
3.4  Math (KaTeX)
3.5  Tables, Code Blocks, Task Lists
3.6  Images & Embeds
3.7  Source Mode & Export
3.8  Frontmatter
4. PDF Editor
4.1  Viewing & Navigation
4.2  Annotation Tools
4.3  Page Operations
4.4  Persistence & Auto-Save
4.5  Forms
4.6  Edge Cases
5. Canvas (Drawing)
5.1  Tools & Drawing
5.2  Layers
5.3  Undo / Redo
5.4  Save & Lifecycle (Critical)
5.5  File Format & Migration
5.6  Export
6. Board (Quick Capture)
6.1  Thought CRUD
6.2  Image Thoughts
6.3  Layout & Edge Cases
7. Tasks
7.1  Quick-Add Parsing
7.2  Smart Filters
7.3  Task Operations
7.4  Recurring Tasks
7.5  Export
8. Bookmarks
8.1  Bookmark CRUD
8.2  Categories & Organization
9. Calendar
9.1  Event CRUD
9.2  Month View & Navigation
10. Kanban
10.1  Board Rendering & Interaction
11. Search
11.1  Index & Query
11.2  Filters
11.3  Content Indexing
12. Graph Visualization
12.1  Rendering & Interaction
12.2  Edge Cases
13. Sync (Dropbox)
13.1  Setup & Authentication
13.2  Sync Operations
13.3  Edge Cases
14. AI Chat
14.1  Settings & Provider Configuration
14.2  Per-Document Chat
14.3  Vault-Wide Chat (RAG)
14.4  Streaming & Cancellation
14.5  Provider-Specific
14.6  Reactivity & Edge Cases
15. Image Editor
15.1  Editing Operations
16. Settings Dialog
16.1  Settings Behavior
17. Service Worker & PWA
17.1  Offline & Caching
17.2  COOP/COEP Headers
18. Cross-Cutting Concerns
18.1  Race Conditions & Data Integrity
18.2  Error Handling
18.3  Performance & Stress
18.4  Accessibility
 
How to Use This Document
Work through each section sequentially. For every test case, mark the Result column:

Symbol	Status	Meaning
☐	Not tested	Test has not been run yet
✅	Pass	Feature works as expected
❌	Fail	Bug or regression found
⚠️	Partial	Works with caveats or minor issues
N/A	Not applicable	Feature not available on this platform/browser

Use the Notes column for bug details, screenshots, browser/OS info, or skip reasons.
 
Summary
This test plan covers 18 major areas with 399 individual test cases spanning every feature surface of Mentis. The areas covered are:

#	Area	Sub-sections	Test Cases
1	Vault & File System	5 groups	39 tests
2	Navigation & Views	4 groups	27 tests
3	Markdown Editor	8 groups	40 tests
4	PDF Editor	6 groups	37 tests
5	Canvas (Drawing)	6 groups	37 tests
6	Board (Quick Capture)	3 groups	13 tests
7	Tasks	5 groups	28 tests
8	Bookmarks	2 groups	10 tests
9	Calendar	2 groups	11 tests
10	Kanban	1 groups	9 tests
11	Search	3 groups	18 tests
12	Graph Visualization	2 groups	12 tests
13	Sync (Dropbox)	3 groups	15 tests
14	AI Chat	6 groups	49 tests
15	Image Editor	1 groups	9 tests
16	Settings Dialog	1 groups	7 tests
17	Service Worker & PWA	2 groups	10 tests
18	Cross-Cutting Concerns	4 groups	28 tests
 
1. Vault & File System
Core vault lifecycle, file system adapters, and file operations. This is the foundation — everything else depends on it.
Vault Creation & Opening
#	Test Case	Result	Notes
1.1.1	Create a new vault via OPFS — verify config.json created with defaults	☐	
1.1.2	Open an existing OPFS vault — verify files/settings preserved	☐	
1.1.3	Open a folder via File System Access API (Chromium) — verify permission prompt + read/write	☐	
1.1.4	Reload page — verify FSAPI handle persisted in IndexedDB and permission re-granted silently	☐	
1.1.5	Open a vault that was previously used with a different adapter — verify graceful handling	☐	
1.1.6	Create vault with unicode characters in name — verify no path encoding issues	☐	

File CRUD Operations
#	Test Case	Result	Notes
1.2.1	Create markdown file — verify appears in tree, search index updated	☐	
1.2.2	Create PDF file — verify appears in tree, pages rendered	☐	
1.2.3	Create canvas file — verify .canvas JSON created + _marrow/_drawings/ folder	☐	
1.2.4	Rename file — verify all open tabs update path, search index updated	☐	
1.2.5	Rename file with case-only change (e.g. "note" → "Note") — no false "already exists" error	☐	
1.2.6	Delete file — verify removed from tree, search index, tabs closed	☐	
1.2.7	Delete folder recursively — verify all children + index entries removed	☐	
1.2.8	Duplicate file — creates copy with " Copy" suffix, independent content	☐	
1.2.9	Move file to different folder via context menu — path updated in tabs + index	☐	
1.2.10	Create file in _inbox/ folder — verify visible in UI	☐	
1.2.11	Attempt to create file with / or \ in name — rejected gracefully	☐	

Auto-Save Behavior
#	Test Case	Result	Notes
1.3.1	Enable auto-save (5s) — edit note — wait 5s — verify saved to disk	☐	
1.3.2	Rapid edits within debounce window — verify timer resets, single save at end	☐	
1.3.3	Edit note — switch tabs (blur) — verify immediate save on blur	☐	
1.3.4	Disable auto-save — edit — wait 30s — verify NOT saved until Ctrl+S	☐	
1.3.5	Auto-save interval set to 3s — verify change takes effect immediately	☐	
1.3.6	Rename file while auto-save timer is pending — verify save goes to NEW path, not old	☐	
1.3.7	Close tab during auto-save flush — verify no data loss	☐	

Snapshots / Version History
#	Test Case	Result	Notes
1.4.1	Enable snapshots — edit PDF — verify pre-edit snapshot created in _marrow/snapshots/	☐	
1.4.2	List snapshots — verify sorted newest-first with human-readable times	☐	
1.4.3	Restore snapshot — verify safety snapshot of current state created first, then file replaced	☐	
1.4.4	Delete individual snapshot — verify removed from disk	☐	
1.4.5	Set max=3 — create 4 snapshots — verify oldest auto-pruned	☐	
1.4.6	Set retention=1 day — verify snapshots older than 24h auto-deleted	☐	
1.4.7	Disable snapshots — edit PDF — verify no snapshot created	☐	

Vault Structure Integrity
#	Test Case	Result	Notes
1.5.1	Verify _marrow/ directory hidden from file tree (Vault view)	☐	
1.5.2	Verify _marrow/_board/ hidden from tree/search	☐	
1.5.3	Verify _marrow/_bookmarks/ hidden from tree/search	☐	
1.5.4	Verify _marrow/_tasks/ hidden from tree/search	☐	
1.5.5	Verify _marrow/_calendar/ hidden from tree (visible in Files view)	☐	
1.5.6	Verify _marrow/_chats/ hidden from tree/search/graph	☐	
1.5.7	Verify _assets/ folders hidden from tree but images shown inline in notes	☐	
1.5.8	Open Files view (Ctrl+7) — verify ALL hidden folders visible	☐	

 
2. Navigation & Views
Sidebar, view switching, keyboard shortcuts, and responsive layout.
View Switching
#	Test Case	Result	Notes
2.1.1	Ctrl+0 → Vault Chat view	☐	
2.1.2	Ctrl+1 → Vault view (file tree + editor)	☐	
2.1.3	Ctrl+2 → Board view	☐	
2.1.4	Ctrl+3 → Tasks view	☐	
2.1.5	Ctrl+4 → Bookmarks view	☐	
2.1.6	Ctrl+5 → Calendar view	☐	
2.1.7	Ctrl+6 → Graph view	☐	
2.1.8	Ctrl+7 → Files view (raw browser with hidden folders)	☐	
2.1.9	Ctrl+8 / Ctrl+F → Search view	☐	
2.1.10	Ctrl+N → New file wizard	☐	
2.1.11	Sidebar nav icons match each view and highlight active state	☐	

Sidebar & Layout
#	Test Case	Result	Notes
2.2.1	Toggle sidebar with Ctrl+\ — verify collapse/expand animation	☐	
2.2.2	Sidebar state persists across page reload	☐	
2.2.3	Drag sidebar edge to resize (min 200px, max 400px)	☐	
2.2.4	Tree mode vs. browse mode toggle — verify persists in localStorage per vault	☐	
2.2.5	Keyboard shortcuts dialog (Ctrl+Shift+?) — verify all shortcuts listed by category	☐	

Mobile Responsiveness (≤767px)
#	Test Case	Result	Notes
2.3.1	Resize below 768px — sidebar becomes hamburger sheet	☐	
2.3.2	Tap hamburger — left sheet opens with nav items	☐	
2.3.3	Editor toolbar wraps properly on narrow screens	☐	
2.3.4	PDF pages fit to width on mobile	☐	
2.3.5	Dialogs/modals max at 90vw, centered	☐	
2.3.6	Touch interactions work for all interactive elements	☐	

Theme & Appearance
#	Test Case	Result	Notes
2.4.1	Light mode — verify light background throughout all views	☐	
2.4.2	Dark mode — verify dark background, no white-flash or unstyled elements	☐	
2.4.3	System mode — follows OS preference; toggles live when OS theme changes	☐	
2.4.4	Theme persists across reload (localStorage)	☐	
2.4.5	All views, dialogs, and overlays respect current theme	☐	

 
3. Markdown Editor
Tiptap-based WYSIWYG with slash commands, wiki-links, math, tables, and export.
Slash Commands
#	Test Case	Result	Notes
3.1.1	Type / at start of line — menu appears with all commands	☐	
3.1.2	Filter by typing (e.g. /h1) — shows Heading 1	☐	
3.1.3	Select Heading 1, 2, 3 — verify block type changes	☐	
3.1.4	Select Bullet List, Numbered List, Task List — verify list created	☐	
3.1.5	Select Quote — verify blockquote styling	☐	
3.1.6	Select Code Block — verify fenced code with syntax highlighting	☐	
3.1.7	Select Divider — verify horizontal rule inserted	☐	
3.1.8	Escape key — dismisses slash menu without inserting	☐	

Inline Formatting
#	Test Case	Result	Notes
3.2.1	Ctrl+B — toggle bold on selection	☐	
3.2.2	Ctrl+I — toggle italic on selection	☐	
3.2.3	Strikethrough via toolbar — verify styled	☐	
3.2.4	Inline code via Ctrl+` — verify monospace styling	☐	
3.2.5	Formatting toolbar buttons show active state when cursor is in formatted text	☐	
3.2.6	Nested formatting (bold + italic) — verify both applied	☐	

Wiki-Links & Navigation
#	Test Case	Result	Notes
3.3.1	Type [[ — autocomplete menu appears listing vault files	☐	
3.3.2	Filter autocomplete by typing filename	☐	
3.3.3	Select file — [[filename]] inline node created	☐	
3.3.4	Click wiki-link — opens target file in new editor tab	☐	
3.3.5	Wiki-link to nonexistent file — shows as broken link (different style)	☐	
3.3.6	Spaces/hyphens/underscores in filenames — resolveWikiLinkPath normalizes correctly	☐	
3.3.7	Wiki-link to file in subfolder — e.g. [[Notes/Daily]] resolves correctly	☐	

Math (KaTeX)
#	Test Case	Result	Notes
3.4.1	Inline math $E=mc^2$ — renders inline LaTeX	☐	
3.4.2	Display math $$\int_0^\infty e^{-x} dx = 1$$ — renders centered block	☐	
3.4.3	Invalid LaTeX — shows error indicator, doesn’t crash editor	☐	

Tables, Code Blocks, Task Lists
#	Test Case	Result	Notes
3.5.1	Create markdown table — verify renders as formatted table	☐	
3.5.2	Code block with language hint (```js) — verify syntax highlighting via lowlight	☐	
3.5.3	Task list — click checkbox — verify [ ] toggles to [x] and persists	☐	
3.5.4	Nested lists (bullet inside numbered) — verify proper indentation	☐	

Images & Embeds
#	Test Case	Result	Notes
3.6.1	Drag image into editor — stored in _assets/ folder, rendered inline	☐	
3.6.2	Embedded PDF page ![[file.pdf#page=3]] — renders page inline	☐	
3.6.3	Copy-paste image from clipboard — saved and embedded	☐	
3.6.4	Image with very large dimensions — auto-scaled to fit editor width	☐	

Source Mode & Export
#	Test Case	Result	Notes
3.7.1	Toggle source mode — shows raw .md in textarea	☐	
3.7.2	Edit in source mode — switch back — verify changes reflected	☐	
3.7.3	Export as Markdown download — verify file contents are valid GFM	☐	
3.7.4	Print/Export as HTML — verify styled output via buildExportHtml + printExportHtml	☐	
3.7.5	Round-trip fidelity: load → save → reload — verify no formatting drift	☐	

Frontmatter
#	Test Case	Result	Notes
3.8.1	File with YAML frontmatter — verify parsed correctly, not shown in editor	☐	
3.8.2	Kanban frontmatter (type: kanban) — verify detectEditorTabType routes to KanbanEditor	☐	
3.8.3	chatAssetId in frontmatter — verify used for per-document chat thread lookup	☐	

 
4. PDF Editor
PDF.js rendering + Fabric.js annotation overlay with destructive writes via pdf-lib.
Viewing & Navigation
#	Test Case	Result	Notes
4.1.1	Open PDF — verify all pages render via canvas	☐	
4.1.2	Zoom in/out (Ctrl+Plus/Minus) — smooth scaling	☐	
4.1.3	Navigate pages (arrows, thumbnails tab)	☐	
4.1.4	Outline tab — shows PDF bookmarks/TOC if present	☐	
4.1.5	Search text in PDF (Ctrl+F) — matches highlighted, navigate between	☐	
4.1.6	Large PDF (100+ pages) — verify lazy rendering, no freezing	☐	

Annotation Tools
#	Test Case	Result	Notes
4.2.1	Highlight tool — select text area — 5 colors available (yellow/green/blue/pink/red)	☐	
4.2.2	Draw/Ink tool — freehand draw with pressure sensitivity (Pointer Events API)	☐	
4.2.3	Adjust draw brush: size, color, opacity — verify visual changes	☐	
4.2.4	Text annotation — click page — type — 10 colors available	☐	
4.2.5	Comment (sticky note) — click page — type — verify native /Text annotation with InkMarrow marker	☐	
4.2.6	Signature — draw new signature — save — reuse from dropdown	☐	
4.2.7	Eraser tool — remove ink strokes	☐	
4.2.8	Select tool — click annotation to move/resize	☐	

Page Operations
#	Test Case	Result	Notes
4.3.1	Insert blank page (blank/lined/grid styles) — verify appended at end	☐	
4.3.2	Insert page at specific position — verify ordering	☐	
4.3.3	Delete page — verify removed, remaining pages renumbered	☐	
4.3.4	Rotate page (90° increments) — verify rotation persisted	☐	
4.3.5	Reorder pages via drag in thumbnails tab — verify new order saved	☐	
4.3.6	Multi-select pages — extract to new PDF	☐	
4.3.7	Merge another PDF into current — verify pages appended	☐	
4.3.8	Split PDF — extract range to new file	☐	
4.3.9	appendBlankPage uses getPageCount() on current bytes (not stale state)	☐	

Persistence & Auto-Save
#	Test Case	Result	Notes
4.4.1	Annotations written destructively into PDF bytes via pdf-lib (no sidecar)	☐	
4.4.2	Auto-save fires — viewer reloads file bytes so raster matches disk	☐	
4.4.3	addAnnotation with fromLoader: true when hydrating from disk — no false dirty flags	☐	
4.4.4	Undo stack — up to 20 pre-operation snapshots — verify undo reverts correctly	☐	
4.4.5	First edit — snapshot created in _marrow/snapshots/	☐	
4.4.6	Save after annotation — close — reopen — annotations still present	☐	

Forms
#	Test Case	Result	Notes
4.5.1	Open PDF with form fields — PdfFormDialog shows fields	☐	
4.5.2	Fill text fields, toggle checkboxes, select dropdowns — verify values saved	☐	
4.5.3	Submit form data — verify field values written into PDF bytes	☐	

Edge Cases
#	Test Case	Result	Notes
4.6.1	PDF with no pages — graceful error	☐	
4.6.2	Corrupted/truncated PDF — error message, no crash	☐	
4.6.3	Password-protected PDF — prompt for password or clear error	☐	
4.6.4	PDF with mixed page sizes (A4 + Letter) — renders each page at correct size	☐	
4.6.5	Very large PDF (50MB+) — loads without OOM, progress indicator	☐	

 
5. Canvas (Drawing)
PixiJS v8 WebGL raster engine with layers, blend modes, and pressure-sensitive brushes.
Tools & Drawing
#	Test Case	Result	Notes
5.1.1	Brush (B) — draw strokes — verify smooth rendering with Catmull-Rom interpolation	☐	
5.1.2	Eraser (E) — erase pixels — verify eraser uses PixiJS erase blend	☐	
5.1.3	Pan (H) — drag to scroll viewport	☐	
5.1.4	Fill (G) — bucket fill on area — verify flood fill respects alpha	☐	
5.1.5	Eyedropper (I) — pick color from canvas — verify correct hex returned	☐	
5.1.6	Brush size adjust with [ and ] keys — verify visual feedback	☐	
5.1.7	Pressure sensitivity — light press = thin/faint, hard press = thick/opaque	☐	
5.1.8	Zoom 0.1× to 10× — verify rendering stays crisp	☐	

Layers
#	Test Case	Result	Notes
5.2.1	Add new layer — verify appears in panel, painting isolated to active layer	☐	
5.2.2	Lock layer — attempt to draw — verify blocked	☐	
5.2.3	Toggle layer visibility — verify hidden/shown	☐	
5.2.4	Adjust layer opacity (0–100%) — verify visual change	☐	
5.2.5	Reorder layers via drag — verify compositing order changes	☐	
5.2.6	Delete layer — verify removed from panel and render	☐	
5.2.7	Blend modes (multiply, screen, overlay, etc.) — verify visual effect	☐	
5.2.8	HSL blend modes may fall back to normal (BUG-16) — verify no crash	☐	

Undo / Redo
#	Test Case	Result	Notes
5.3.1	Draw stroke — Ctrl+Z undo — stroke disappears (PNG blob snapshot)	☐	
5.3.2	Ctrl+Shift+Z or Ctrl+Y redo — stroke reappears	☐	
5.3.3	Delete layer — undo — layer restored with pixels and correct stack position	☐	
5.3.4	Reorder layers — undo — original order restored	☐	
5.3.5	Multiple sequential undos — verify each step reverts correctly	☐	

Save & Lifecycle (Critical)
#	Test Case	Result	Notes
5.4.1	Auto-save fires ~3s after last stroke — verify PNGs written to _marrow/_drawings/<assetId>/	☐	
5.4.2	Save order: PNGs first, JSON last — verify crash-safe ordering	☐	
5.4.3	Unmount cleanup: ticker stopped → ResizeObserver disconnected → flushSave awaited → destroy()	☐	
5.4.4	Unmount save writes to pathRef.current (live path), NOT closure path	☐	
5.4.5	pendingCanvasSaves: remount same path — new mount awaits previous flush before reading disk	☐	
5.4.6	Rename .canvas file — assetId stays the same, drawings folder NOT moved	☐	
5.4.7	Ctrl+S — force-save bypasses debounce timer	☐	
5.4.8	saveOnBlur: switch away from canvas tab — verify immediate save	☐	

File Format & Migration
#	Test Case	Result	Notes
5.5.1	Open v3 canvas (inline base64 PNGs) — migrated to v5 on save	☐	
5.5.2	Open v4 canvas (sibling .assets/ folder) — migrated to v5, old folder left as orphan	☐	
5.5.3	v5 format: small JSON + layer PNGs in _marrow/_drawings/<assetId>/	☐	
5.5.4	Missing/corrupt layer PNG — layer loads blank, rest of canvas intact	☐	
5.5.5	assetId minted lazily on first save if absent	☐	

Export
#	Test Case	Result	Notes
5.6.1	Export as PNG — all visible layers flattened, correct dimensions	☐	
5.6.2	Export as PDF — canvas content rendered to PDF page	☐	
5.6.3	Export with hidden layers — verify hidden layers excluded	☐	

 
6. Board (Quick Capture)
Masonry-layout notice board for quick thoughts, stored as markdown in _marrow/_board/.
Thought CRUD
#	Test Case	Result	Notes
6.1.1	Create new thought — card appears in masonry layout	☐	
6.1.2	Set color (yellow/blue/pink/green/purple/white) — verify visual change	☐	
6.1.3	Inline edit title (first # H1) — blur — verify saved	☐	
6.1.4	Inline edit body — bold/italic/underline/lists via keyboard shortcuts	☐	
6.1.5	Delete thought — confirm — removed from board and disk	☐	
6.1.6	Auto-save on edit (750ms debounce) — verify .md file updated	☐	

Image Thoughts
#	Test Case	Result	Notes
6.2.1	Drag image onto board — image thought created in _marrow/_board/_assets/	☐	
6.2.2	Click image thumbnail — opens image editor	☐	
6.2.3	Delete image thought — verify image file cleaned up	☐	

Layout & Edge Cases
#	Test Case	Result	Notes
6.3.1	Many thoughts (50+) — masonry CSS columns reflow correctly	☐	
6.3.2	Empty board — shows empty state / create prompt	☐	
6.3.3	Very long thought text — card expands vertically, no overflow	☐	
6.3.4	Rapid create/delete — no state desync between UI and disk	☐	

 
7. Tasks
CalDAV-compatible task manager with natural-language quick-add, lists, subtasks, and smart filters.
Quick-Add Parsing
#	Test Case	Result	Notes
7.1.1	"Buy milk !1 #grocery >today" → priority=1, tag=grocery, due=today	☐	
7.1.2	"Weekly standup every monday" → repeat=weekly, repeatWeekday=1, due=next Monday	☐	
7.1.3	"Project >2026-04-25 #work !2" → order-independent parsing	☐	
7.1.4	"Call dentist >tomorrow" → due = tomorrow’s date (absolute)	☐	
7.1.5	"Review PR >wednesday" → due = next Wednesday	☐	
7.1.6	"Team sync on wednesdays" → repeat=weekly, repeatWeekday=3	☐	
7.1.7	Explicit >YYYY-MM-DD due wins when both due and "on day" present	☐	
7.1.8	Tags are lowercased: #Work → stored as "work"	☐	
7.1.9	Priority range 1–4 only — !5 or !0 ignored	☐	

Smart Filters
#	Test Case	Result	Notes
7.2.1	Inbox — shows tasks with no list assigned	☐	
7.2.2	Today — shows tasks due today, excludes done/cancelled	☐	
7.2.3	Upcoming — shows tasks due this week, excludes done/cancelled	☐	
7.2.4	Per-list filter — shows only tasks in selected list	☐	
7.2.5	All — shows every task in active list regardless of status	☐	

Task Operations
#	Test Case	Result	Notes
7.3.1	Create task — verify .md file in _marrow/_tasks/ with correct frontmatter	☐	
7.3.2	Check task done — status=done, completed timestamp set	☐	
7.3.3	Uncheck task — status reverts to active	☐	
7.3.4	Delete task — removed from list and disk	☐	
7.3.5	Edit task inline — title/tags/priority/due updated	☐	
7.3.6	Subtask: create child linked by parent UID — verify tree structure	☐	
7.3.7	Create custom list "Work" — subfolder created in _marrow/_tasks/	☐	
7.3.8	Move task between lists — file moved to new subfolder	☐	

Recurring Tasks
#	Test Case	Result	Notes
7.4.1	Complete repeating task — due date rolls forward to next occurrence	☐	
7.4.2	"every monday" task completed on Monday — new due = next Monday	☐	
7.4.3	Recurring task with no initial due — due set to next occurrence from today	☐	

Export
#	Test Case	Result	Notes
7.5.1	Export as .ics — download iCalendar file	☐	
7.5.2	Import .ics into Apple Calendar / Google Calendar — tasks appear correctly	☐	
7.5.3	Recurring tasks export with RRULE	☐	

 
8. Bookmarks
Web bookmark manager with OG metadata auto-fetch, categories, and tags.
Bookmark CRUD
#	Test Case	Result	Notes
8.1.1	Add bookmark by URL — fetchOgMetadata auto-populates title/description/image/favicon	☐	
8.1.2	Override auto-fetched metadata manually — custom values saved	☐	
8.1.3	Edit bookmark — update URL/title/tags via Radix Dialog	☐	
8.1.4	Delete bookmark — removed from category folder	☐	
8.1.5	Bookmark with unreachable URL — CORS-safe fallback, no crash	☐	

Categories & Organization
#	Test Case	Result	Notes
8.2.1	Create category "Tech" — subfolder in _marrow/_bookmarks/	☐	
8.2.2	Assign bookmark to category — verify .md moved to subfolder	☐	
8.2.3	Two-panel layout: category sidebar + bookmark list	☐	
8.2.4	Search bookmarks by title/description — verify filtering	☐	
8.2.5	Filter by tags — AND logic (all tags must match)	☐	

 
9. Calendar
Local-first event calendar with month grid view and task integration.
Event CRUD
#	Test Case	Result	Notes
9.1.1	Click day cell — create event dialog with title, start/end, color	☐	
9.1.2	Save event — .md in _marrow/_calendar/ with correct frontmatter	☐	
9.1.3	Edit event — change title/time/color — verify persisted	☐	
9.1.4	Delete event — removed from calendar and disk	☐	
9.1.5	Toggle all-day — time fields disabled/enabled	☐	
9.1.6	Event colors: violet, sky, emerald, amber, rose, slate — verify visual change	☐	

Month View & Navigation
#	Test Case	Result	Notes
9.2.1	Navigate months (prev/next arrows) — grid updates	☐	
9.2.2	Events render as chips on correct day cells	☐	
9.2.3	Multi-day event — spans across multiple day cells	☐	
9.2.4	Tasks with due dates — appear as greyed "task due" chips	☐	
9.2.5	Today highlighted in grid	☐	

 
10. Kanban
Markdown-based drag-and-drop board. A regular .md file with type: kanban frontmatter.
Board Rendering & Interaction
#	Test Case	Result	Notes
10.1.1	Create .md with type: kanban frontmatter — renders as board, not prose	☐	
10.1.2	Columns from ## headings — each heading = one column	☐	
10.1.3	Column colors via <!--kanban:amber--> comment — 7 colors available	☐	
10.1.4	Cards from - [ ] / - [x] items — rendered with checkboxes	☐	
10.1.5	Drag card between columns via grip handle — order persisted	☐	
10.1.6	Drag column by header grip — reorder persisted	☐	
10.1.7	Edit card text inline — auto-save 750ms debounce	☐	
10.1.8	Toggle card checkbox — [ ] ↔ [x] persisted	☐	
10.1.9	File remains valid .md — searchable, syncable, readable externally	☐	

 
11. Search
MiniSearch-powered full-text search with fuzzy matching, filters, and incremental index updates.
Index & Query
#	Test Case	Result	Notes
11.1.1	Open vault — search index built, stored in _marrow/search-index.json	☐	
11.1.2	Create/save file — index updated incrementally	☐	
11.1.3	Rename file — old entry removed, new entry added	☐	
11.1.4	Delete file — entry removed from index	☐	
11.1.5	Fuzzy search (fuzz=0.2) — "projct" matches "project"	☐	
11.1.6	Prefix matching — "pro" matches "project", "promise", "protocol"	☐	
11.1.7	Title boosted 3× over body — title matches rank higher	☐	
11.1.8	Tags boosted 2× — #tag search prioritizes tag matches	☐	

Filters
#	Test Case	Result	Notes
11.2.1	File type filter: markdown only — PDF/canvas hidden	☐	
11.2.2	File type filter: PDF only — markdown/canvas hidden	☐	
11.2.3	Folder prefix filter: "Notes/" — only files in Notes/ shown	☐	
11.2.4	#tag filter — AND logic (all specified tags must match)	☐	
11.2.5	Date range filter (from/to) — only files modified in range	☐	
11.2.6	Combined filters: type + folder + tags + date — all AND’d together	☐	

Content Indexing
#	Test Case	Result	Notes
11.3.1	Markdown: title + body indexed	☐	
11.3.2	PDF: text extracted via extractPdfText, capped at 14k chars	☐	
11.3.3	Canvas: title/path indexed (no text in drawings)	☐	
11.3.4	Snippet generation — context around first match shown in results	☐	

 
12. Graph Visualization
Force-directed graph of wiki-link connections between vault files.
Rendering & Interaction
#	Test Case	Result	Notes
12.1.1	Open graph — nodes for all .md, .pdf, .canvas files	☐	
12.1.2	Distinct shapes: circle (note), rounded square (PDF), diamond (canvas)	☐	
12.1.3	Wiki-link [[B]] in Note A — edge drawn from A to B	☐	
12.1.4	Click node — opens file in Vault editor	☐	
12.1.5	Drag node — physics simulation responds (repulsion/attraction)	☐	
12.1.6	Pan (drag background) and zoom (scroll wheel)	☐	
12.1.7	Folder dropdown filter — shows only nodes in selected folder	☐	

Edge Cases
#	Test Case	Result	Notes
12.2.1	Self-reference [[same note]] — no self-loop edge	☐	
12.2.2	Broken link [[nonexistent]] — no edge created	☐	
12.2.3	Orphan node (no links) — still visible in graph	☐	
12.2.4	Very large vault (1000+ nodes) — performance acceptable, no freeze	☐	
12.2.5	Files with many outgoing links (20+) — render without overlap issues	☐	

 
13. Sync (Dropbox)
Optional Dropbox sync via OAuth 2 PKCE. Last-write-wins conflict resolution.
Setup & Authentication
#	Test Case	Result	Notes
13.1.1	Settings → Sync tab — connect Dropbox — OAuth redirect + token stored in IndexedDB	☐	
13.1.2	Set remote path (e.g. /Apps/Mentis/MyVault) — verify persisted	☐	
13.1.3	Reload page — token restored from IndexedDB, re-authenticated silently	☐	
13.1.4	Disconnect Dropbox — tokens cleared, sync stops	☐	

Sync Operations
#	Test Case	Result	Notes
13.2.1	Full sync on vault open — local + remote reconciled via SHA-256 manifest	☐	
13.2.2	Create file locally — pushFile after save — appears in Dropbox	☐	
13.2.3	Create file in Dropbox web — poll interval fires — file pulled locally	☐	
13.2.4	Edit same file on both sides — last-write-wins by modifiedAt timestamp	☐	
13.2.5	Delete file locally — verify deleted on remote after sync	☐	
13.2.6	Manual sync button — force immediate full sync	☐	
13.2.7	Change poll interval in settings — verify new interval takes effect	☐	

Edge Cases
#	Test Case	Result	Notes
13.3.1	Network offline during sync — graceful error, retries on next interval	☐	
13.3.2	Large file upload (50MB PDF) — progress indication, no timeout	☐	
13.3.3	Sync while editing — no data loss or conflict with auto-save	☐	
13.3.4	OAuth token expired — refresh flow or re-auth prompt	☐	

 
14. AI Chat
BYO-LLM chat with 8 providers, per-document and vault-wide surfaces, thread persistence.
Settings & Provider Configuration
#	Test Case	Result	Notes
14.1.1	Provider dropdown — all 8 providers listed	☐	
14.1.2	Select cloud provider (OpenAI) — API key field shown	☐	
14.1.3	Select local provider (webllm/window-ai) — API key field HIDDEN	☐	
14.1.4	Select Ollama — API key field hidden, base URL shown	☐	
14.1.5	Test connection button — green checkmark on success, error message on failure	☐	
14.1.6	Test connection auto-saves API key on success + fires key-changed event	☐	
14.1.7	Model dropdown — populated from provider API after successful test	☐	
14.1.8	Model dropdown for webllm — pulls from @mlc-ai/web-llm catalog dynamically	☐	
14.1.9	Model dropdown for window-ai — fixed "gemini-nano" entry	☐	
14.1.10	WebLLM "Load into browser" button — triggers weight download, shows progress	☐	
14.1.11	Change provider — model list resets, test status resets	☐	
14.1.12	Save settings — chat panels pick up changes WITHOUT page refresh	☐	

Per-Document Chat
#	Test Case	Result	Notes
14.2.1	Open markdown note — click sparkle button — chat panel opens in right column	☐	
14.2.2	First open — draft thread in memory (not persisted until first send)	☐	
14.2.3	Send message — user message appears, assistant streams response token by token	☐	
14.2.4	Context: document content truncated to maxContextChars (40k default)	☐	
14.2.5	Create new thread (+ button) — new conversation, old preserved	☐	
14.2.6	Switch threads — messages update to selected thread	☐	
14.2.7	Delete thread — removed from sidebar and _marrow/_chats/<assetId>/	☐	
14.2.8	Close panel — no data loss	☐	
14.2.9	Thread persisted as JSON on stream end (not per-delta)	☐	

Vault-Wide Chat (RAG)
#	Test Case	Result	Notes
14.3.1	Switch to Vault Chat view (Ctrl+0) — full-viewport two-pane layout	☐	
14.3.2	Send message — RAG runs MiniSearch query, top-6 matches attached as context	☐	
14.3.3	System prompt instructs model to cite sources as backticked paths	☐	
14.3.4	Source chips below assistant messages — click opens file in Vault view	☐	
14.3.5	Thread list sidebar — switch between threads	☐	
14.3.6	Threads stored in _marrow/_chats/_vault/ (reserved sentinel)	☐	
14.3.7	New message in same thread — RAG re-runs per turn (context refreshes)	☐	

Streaming & Cancellation
#	Test Case	Result	Notes
14.4.1	Long response — content appends smoothly as tokens arrive	☐	
14.4.2	Click cancel mid-stream — AbortController fires, partial content saved	☐	
14.4.3	Provider returns error mid-stream — error message shown, partial content preserved	☐	
14.4.4	Network disconnect during stream — error displayed, no crash	☐	
14.4.5	Send while already streaming — blocked (isStreaming guard)	☐	

Provider-Specific
#	Test Case	Result	Notes
14.5.1	OpenRouter — OpenAI-compatible SSE, one key many models	☐	
14.5.2	OpenAI — /v1/chat/completions SSE, Bearer token auth	☐	
14.5.3	Anthropic — /v1/messages named SSE events, x-api-key + anthropic-dangerous-direct-browser-access	☐	
14.5.4	Gemini — streamGenerateContent?alt=sse, key as query param, role "model" not "assistant"	☐	
14.5.5	HuggingFace — OpenAI-compatible router	☐	
14.5.6	Ollama — localhost:11434/v1, no auth header by default	☐	
14.5.7	window-ai — cumulative text stream diffed into deltas	☐	
14.5.8	WebLLM — dynamic import, engine cached per model, WebGPU required	☐	

Reactivity & Edge Cases
#	Test Case	Result	Notes
14.6.1	Save API key in settings — chat panel re-reads key without refresh (ink:chat-key-changed event)	☐	
14.6.2	Change provider in settings — chat panel updates immediately	☐	
14.6.3	No provider selected — chat shows "Configure a provider in Settings → AI"	☐	
14.6.4	Provider selected but no key — shows "Add an API key in Settings → AI"	☐	
14.6.5	Local provider (webllm) selected — chat immediately ready, no key gate	☐	
14.6.6	Switch document with chat open — threads reload for new document’s assetId	☐	
14.6.7	chatAssetId: markdown stores UUID in frontmatter; PDF uses path-keyed index.json	☐	
14.6.8	PDF rename outside app — chat asset association lost (known trade-off)	☐	

 
15. Image Editor
PNG/JPEG/WebP editing: rotate, edge-trim crop, brightness/contrast/saturation. GIF/SVG/BMP/ICO: preview only.
Editing Operations
#	Test Case	Result	Notes
15.1.1	Open PNG/JPEG/WebP — ImageEditorView with toolbar	☐	
15.1.2	Rotate left/right (90° increments) — verify orientation changes	☐	
15.1.3	Edge-trim crop (left/right/top/bottom sliders) — verify preview updates	☐	
15.1.4	Brightness slider (0–200%) — verify visual change	☐	
15.1.5	Contrast slider (0–200%) — verify visual change	☐	
15.1.6	Saturation slider (0–200%) — verify visual change	☐	
15.1.7	Combine all edits — save — reopen — edits persisted	☐	
15.1.8	Undo all edits — revert to original	☐	
15.1.9	Open GIF/SVG/BMP/ICO — plain preview via VaultImageView (no edit tools)	☐	

 
16. Settings Dialog
Six-tab settings: Vault, Editor, Snapshots, Sync, AI, Calendar. Auto-save with 600ms debounce.
Settings Behavior
#	Test Case	Result	Notes
16.1.1	Open settings — draft populated from current config	☐	
16.1.2	Change any setting — auto-save fires after 600ms debounce	☐	
16.1.3	Ctrl+S in settings — immediate save bypassing debounce	☐	
16.1.4	Footer shows "Saving…" spinner then "Saved" checkmark	☐	
16.1.5	Close and reopen — changes persisted	☐	
16.1.6	Switch tabs — state preserved within same dialog session	☐	
16.1.7	All 6 tabs accessible: Vault, Editor, Snapshots, Sync, AI, Calendar	☐	

 
17. Service Worker & PWA
Hand-written sw.js with content-hash cache-first for static assets and stale-while-revalidate for the rest.
Offline & Caching
#	Test Case	Result	Notes
17.1.1	Install PWA (Add to Home Screen) — verify installable	☐	
17.1.2	Go offline — navigate pages — verify loads from cache	☐	
17.1.3	Precached: /, /manifest.json, /icon.svg — available immediately offline	☐	
17.1.4	/_next/static/* (immutable content-hashed) — cache-first, never refetches	☐	
17.1.5	Other same-origin GETs — stale-while-revalidate	☐	
17.1.6	Come back online — background refresh updates cache	☐	
17.1.7	Service worker update — skipWaiting, old caches cleared on activation	☐	
17.1.8	Manifest: correct app name, icon, theme color, display mode	☐	

COOP/COEP Headers
#	Test Case	Result	Notes
17.2.1	SharedArrayBuffer available (required by PDF.js) — verify COOP/COEP headers set by hosting layer	☐	
17.2.2	If headers missing — PDF rendering degrades gracefully or shows clear error	☐	

 
18. Cross-Cutting Concerns
Race conditions, error handling, performance, and accessibility.
Race Conditions & Data Integrity
#	Test Case	Result	Notes
18.1.1	Auto-save + rename race: rename file while save timer pending — save goes to NEW path	☐	
18.1.2	Canvas unmount + remount same path: new mount awaits pending save before reading	☐	
18.1.3	Chat stream + provider change: cancel stream then switch provider — no orphaned state	☐	
18.1.4	Sync push + local edit: editing while sync pushes — no overwrite of in-flight changes	☐	
18.1.5	Multiple tabs open same vault (if OPFS) — verify no corruption	☐	
18.1.6	Rapid tab switching between editors — no stale state or leaked listeners	☐	

Error Handling
#	Test Case	Result	Notes
18.2.1	File system permission denied (FSAPI revoked) — clear error, re-prompt	☐	
18.2.2	IndexedDB unavailable (private browsing) — graceful fallback or error	☐	
18.2.3	Network error during OG metadata fetch — bookmark created with URL only	☐	
18.2.4	Invalid markdown (malformed frontmatter) — loads as plain text, no crash	☐	
18.2.5	PDF.js worker fails to load — error boundary with recovery UI	☐	
18.2.6	WebGPU not available (Safari) — webllm shows clear error message	☐	
18.2.7	Ctrl+S with no open file — no-op, no error	☐	
18.2.8	toast.error() + console.error() for all user-facing errors	☐	

Performance & Stress
#	Test Case	Result	Notes
18.3.1	Large vault (10k+ files) — search, graph, file tree remain usable	☐	
18.3.2	Large PDF (500+ pages) — page load and annotation performance	☐	
18.3.3	Large canvas (4000×4000px) — draw performance and layer operations	☐	
18.3.4	Many open tabs (20+) — memory pressure, no leaked editors	☐	
18.3.5	Rapid auto-save (1s interval) — debounce prevents thrashing	☐	
18.3.6	Search index rebuild on large vault — shows progress, doesn’t block UI	☐	

Accessibility
#	Test Case	Result	Notes
18.4.1	Keyboard navigation: Tab through all controls in each view	☐	
18.4.2	Focus trap in modal dialogs (settings, confirm, add bookmark)	☐	
18.4.3	Focus restoration after dialog close	☐	
18.4.4	ARIA labels on icon-only buttons	☐	
18.4.5	No nested interactive elements (no <button> inside <button>)	☐	
18.4.6	Tab UIs use <div role="tab"> with separate <button>s for close	☐	
18.4.7	Zoom to 200% — no layout breaks	☐	
18.4.8	Screen reader: major landmarks announced correctly	☐	

 

Sign-Off


Role	Name	Date
Tested by		
Reviewed by		
Approved by		

Overall status: ____________________

Notes / blockers:


