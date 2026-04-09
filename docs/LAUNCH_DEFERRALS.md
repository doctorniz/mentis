# Pre-launch deferrals

Items here are **logged for review before public launch**. When fixed, move notes to `DEVELOPMENT_PHASES.md` or remove the entry. This file is **pre-launch triage** (UX polish, PDF/canvas parity, mobile export constraints).

**How to read this file**

1. **Open deferrals** — product/engineering work still to do (or “code landed, confirm in UI”).
2. **Manual verification queue** — human checklists: **To do** (`- [ ]`) vs **Done** (`- [x]`).
3. **Addressed in code (archive)** — historical record of fixes; cross-check with verification lists above.

---

## Open deferrals

### Product / engineering (not done or undecided)

| Area | ID | Topic | Notes |
|------|-----|--------|--------|
| Canvas | C14–C25 | Follow-ups | See **Canvas — additional follow-ups (open)** table in this section (same IDs). |
| PDF | ~~P2~~ | ~~Outline vs page panel~~ | **Addressed.** Single tabbed `PdfSideColumn` (Pages / Outline); default Pages. Column auto-collapses when PDF has ≤1 page. Expand/collapse via column header chevron and slim **Layers** rail only (no toolbar Side panel control). |
| PDF | ~~P12~~ | ~~Flatten / save~~ | **Addressed.** No separate Save or Flatten in `PdfToolbar`; annotations persist via `VaultConfig.autoSave` (default **5s** interval, optional blur, configurable/disabled in Settings). `flattenPdf` still exists in `lib/pdf/page-operations.ts` if we reintroduce export UX later. |
| PDF | ~~P13~~ | ~~Save button~~ | **Addressed.** Autosave-only; see P12. |
| Vault tree | T2 | Long-term | Image editing tools (Photoshop-like) — roadmap only. |
| Cross | X1 | Mobile export | Keep web architecture compatible with RN/Capacitor; document in `ARCHITECTURE.md` when chosen. |

### Canvas — additional follow-ups (open)

| ID | Notes |
|----|--------|
| C14 | On first select of a textbox, select all text for easy replace (text + sticky body). |
| C15 | Formatting should apply to selection only, or from caret forward — not whole textbox. |
| C16 | Remove “double-click to edit” hint near font family; colour swatch should fill its control. |
| C17 | Show font names in their own typefaces in the canvas text toolbar. |
| C18 | Renaming title back to original wrongly errors “file already exists” after an intermediate rename. |
| C19 | Newly inserted image should auto-select after place. |
| C20 | Undo/redo for image resize still broken. |
| C21 | DnD into empty expanded folder: tree does not show files until folder collapsed/reopened. |
| C21b | File tree context menu: if still broken, apply same `...rest` pattern as file browser rows. |
| C22 | Browse sub-view: show vault name instead of “file browser” chrome. |
| C23 | Connect tool: remove or fix (cursor / no-op). |
| C24 | Hide or remove sticky note tool for now. |
| C25 | Eraser: expected partial stroke erase, not whole path. |

### Addressed in code — needs confirmation in UI

| Area | ID | Notes |
|------|-----|--------|
| File browser | F4 | Batch selection toolbar must not shift grid/list (double-click to open). **Addressed in code** — confirm. |
| File browser | F6 | Drop-import overlay can stick — **Addressed in code** — confirm drag enter/leave. |

---

## Manual verification queue

**Purpose:** Whenever shipped behavior should be confirmed by a human, track it here. Update **To do** / **Done** in the same change as the code/doc when possible.

**Format:** `- [ ]` = still to run; `- [x]` = verified (move from **To do** to **Done**, or check in place).

**Also:** Repeat **To do** items in PRs/chat under **Manual verification** so assignees do not miss them.

### To do (`- [ ]`)

- [ ] **Branding** — Tab title **Mentis**; landing: title **Mentis** + tagline *an app by Marrow Group*; sidebar + mobile masthead **Mentis**; favicon / PWA icon: brain tile (`/icon.svg`); open-disk error text mentions Mentis vault.
- [ ] **Vault** — 🌳 tree vs 🗂️ browse: switch modes, open md / pdf / canvas from each where applicable.
- [ ] **File browser — context menu & rename** (grid + list): right-click → Open, Rename, Move… (folder modal), Duplicate, Delete (confirm modal); batch Move/Delete. Click-to-rename: click a file to select it, then click the filename again — after a short delay the name becomes editable; **grid** rename field wraps within the column (no overlap into neighbors); double-click still opens instead of renaming. Grid columns must be equal width at all window sizes (no columns wider than others due to long names).
- [ ] **Canvas** — draw, rename file inline, reopen: strokes still there; undo/redo after edits.
- [ ] **New file popover (F7)** — Ctrl+N opens popover with Note, File, Drawing (no subtitles). Click "Note": creates .md, opens tab in tree mode. Click "Drawing": creates .canvas, opens tab. Click "File": shows upload screen with drop zone + Browse button; drag-drop or browse imports files to default folder with toast; single supported file opens a tab. "Create blank PDF" button creates a PDF using the style from Settings. In Settings > Vault, "Default PDF page style" dropdown shows Blank/Lined/Grid and persists on save.
- [ ] **Vault — image from tree** — Click `.png`/`.jpg`/`.jpeg`/`.webp`: toolbar with rotate, brightness/contrast/saturation, optional **Crop** (edge trim sliders), **Save** writes file; thumbnail cache refreshes. GIF/SVG: preview only, no editor toolbar. Rename in header; tab title matches stem.
- [x] **Notes chrome (F8 / M1)** — Sidebar theme: three icon-only toggles (Light / System / Dark). Note mode bar: icon-only Visual / Source tabs; compact export menu trigger (icon + chevron). Menu: **Markdown** and **Print** rows have no subtitle hints. Try Visual and Source modes.
- [ ] **Backlinks panel** — Wide viewport: backlinks column expanded by default; header chevron collapses to slim rail; expand again from rail. Narrow (≤1024px): starts collapsed; expand opens overlay + dimmed scrim; scrim or chevron closes. Count badge on rail when collapsed. Resize from wide into ≤1024px while overlay open: panel should return to rail (no stuck overlay).
- [x] **Mobile main nav (≤767px)** — `MainSidebar` hidden; top masthead shows hamburger + Mentis/vault title. Open menu: **New** is first row with expand chevron; tap expands inline sub-items: **Note**, **File**, **Drawing**. Note creates .md and closes drawer. Drawing creates .canvas and closes drawer. File opens native file picker for import. **Ctrl+N** opens the menu with New accordion auto-expanded. Then Vault, Search, Graph; theme toggles; Settings; Close vault.
- [ ] **Notes vault tree** — Desktop: collapse via header control → folder rail; expand from rail. Mobile (≤767px): tree starts collapsed; open from rail uses left drawer + scrim; collapse closes overlay. Crossing desktop↔mobile updates default expanded/collapsed behavior.
- [ ] **PDF side column (P2)** — Open a multi-page PDF: side column expanded by default on **Pages** tab showing thumbnails. Switch to **Outline** tab: outline tree or "No outline." message. Collapse via header chevron → slim rail (Layers icon). Re-expand from rail; tab selection persists. Open/create a new single-page PDF: column **auto-collapsed** to rail. Add a page (toolbar Add page) then check: column should still work (open, switch tabs). Navigate via outline bookmark → page scrolls. **Multi-select pages:** Ctrl/Cmd+click to toggle individual pages, Shift+click for range; selected pages highlighted with accent tint + badge; Save icon appears in toolbar — click to extract selected pages as new PDF; new tab opens with the extracted pages (not blank).
- [ ] **PDF text box** — Text tool: read hint; place box; toolbar shows Select; drag box; double-click edit; autosave persists text/position.
- [ ] **PDF pen vs highlight color** — Highlight yellow → Draw: stroke black; pick blue pen → Highlight pink → Draw: still blue.
- [ ] **PDF toolbar cleanup** — Toolbar no longer shows Save, Flatten, or Side Panel buttons. PDF autosave uses Settings → Auto-save interval (default **5s**) and optional blur; can be disabled. Undo (`Ctrl+Z`) and Redo (`Ctrl+Shift+Z`) buttons appear after page nav group; perform a page operation (insert, delete, rotate), then Undo → page count reverts; Redo → reapplies. Undo/Redo buttons show muted icons when stack is empty.
- [ ] **PDF save persistence** — Pen tool: draw a stroke, wait for autosave (or blur); reopen PDF or external viewer — ink visible on page. Draw + wait autosave twice does not stack duplicate strokes; page/zoom roughly preserved after save.
- [ ] **PDF page thumbnails** — After insert/delete/rotate/merge, side panel thumbnails update without a long blank/flash (offscreen render then swap).
- [ ] **PDF comments (P6/P7)** — Comment tool: modal (not prompt); text appears in margin rail; autosave + reload keeps comment text and rail; optional check in another PDF viewer for sticky-note contents.
- [ ] **PDF signature (P8)** — Sign tool: place once → toolbar should show Select; drag stamp to a new spot; autosave → reload → position matches.
- [ ] **PDF Add page (P9)** — Toolbar **Add page**: count increases; add twice quickly → two new pages at end, not a bad insert index.
- [ ] **PDF Form fields (P10)** — Open a PDF with no forms: **Form fields** shows an informational message, no error styling; PDF with a text field still lists and saves.
- [ ] **PDF text search (P11)** — Open a text-based PDF: search finds known phrase; highlights and page jump; Prev/Next; try a scan-only PDF → “No matches” without errors.
- [ ] **PDF colours (P14)** — Highlight / Draw / Text: each shows its own swatch row; pick distinct colours, switch tools, place text — text uses Text swatch, not highlight yellow.
- [x] **File browser — image thumbnails (F5)** — Import a few images (png, jpg, gif, webp, svg) into the vault. Grid view: cards show rounded photo thumbnail (56×56); before load, emerald image icon placeholder. List view: rows show small inline thumbnail (20×20) replacing the generic icon. Switch between grid/list; thumbnails persist (cached). Rename an image file — thumbnail still loads for the new name on next refresh.
- [ ] **FSAPI vault persistence** — Use "Open a folder on disk" to select a vault folder. Close the tab or refresh the page. On reload: if browser auto-grants permission, the vault should restore seamlessly; otherwise, a "Reconnect to [folder name]?" prompt should appear — click **Reconnect**, grant the permission, vault opens. "Close vault" should clear the stored handle; next reload shows the landing page without a reconnect prompt.

### Done (`- [x]`)

Move items here when verified; keep a short date or note if useful.

- [x] **File browser — delete confirmation (F3)** — ConfirmDialog for single/batch delete. **User-verified** 2026-04-08.

---

## Addressed in code (archive)

Historical record only. If something regresses, reopen a row under **Open deferrals** or **To do**.

### Canvas — UX & tools

| ID | Topic | Notes |
|----|--------|------|
| C1 | New canvas title | **Addressed in code**: defer `CanvasEditor` mount until `isNew` clears (title focus + `clearNew`) or ~900ms fallback; canvas `tabIndex={-1}`. Verify across devices. |
| C2 | Toolbar vs actual tool | **Addressed in code**: `applyFabricToolModeFromStore` after `renderCanvasFile`, async images, user-added images/frames; tool `useEffect` includes `path` + rAF resync; `reset()` no longer forces `activeTool` to draw on unmount. Verify after rename / tab switch. |
| C3 | Text tool discoverability | **Addressed in code**: placement hints above dock for Text / Sticky; “Double-click to edit” on formatting strip; richer `title` on Select / Text / Sticky buttons. Verify copy and layout. |
| C4 | Text formatting | **Addressed in code**: `resolveFormattableTextbox` (incl. single Textbox inside `ActiveSelection`); `initDimensions` + `setCoords` after style apply; selection sync uses same rules; JSDoc on exclusions (`*_wl`, `__frameId`). Sticky note body remains formattable; wiki/frame labels excluded. |
| C5 | Connect tool | **Addressed in code**: `canonicalNodeId` strips `_text`/`_wl` suffixes so edges always reference canonical node IDs; `connectFromRef` persists across effect re-runs; visual dashed-red ring on first-click source; objects `selectable` but movement-locked during connect; old edge IDs normalized on render; erase correctly removes both line + head via shared `__edgeId`. Verify two-click flow + edge persistence on reload. |
| C6 | Erase tool | **Addressed in code**: drag-to-erase (mouse:down starts, mouse:move sweeps, mouse:up snapshots); `removeCanvasObject` now handles `__frameId` pairs (rect + label); arrow line + head removed together via shared `__edgeId` (already worked); hit-area padding (+8px) on thin objects (lines, paths, triangles) during erase mode; crosshair cursor; tool-specific cursors for connect/text/sticky. Verify sweep-erase on drawings, edges, frames, stickies. |
| C7 | Images | **Addressed in code**: `syncFabricToFileStatic` now syncs `width`/`height` for image nodes (scale × intrinsic); `object:modified` calls `snapshotAndDirty` (sync + undo push) instead of bare `markDirty`; move/resize/rotate of any object now gets a proper undo snapshot. Verify image resize persists on reload and undoes correctly. |
| C8 | Frames | **Addressed in code**: Frame toolbar button removed; existing frames in saved files still render. |
| C9 | Wiki-link / note targets | **Addressed in code**: no create-UI; double-click on existing cards navigates unidirectionally. |
| C10 | Open from Vault tree | **Addressed in code**: all file types (md/pdf/canvas) now open via `openTab` in the editor store + switch to tree mode — from graph view, file browser double-click, and new-file popover. No more local-state-only canvas/PDF that gets lost on mode switch. Verify: open canvas from graph, switch browse↔tree, canvas persists. |
| C11 | `clearRect` / disposed Fabric | **Addressed in code**: `renderCanvasFile` + `isAlive`; guarded async image loads; `handleAddImage`; `ResizeObserver`; undo/redo. |
| C12 | Autosave | **Addressed in code**: flush before canvas rename; `pathRef`; 3s interval; `visibilitychange` / blur; `object:modified` snapshots. |
| C13 | Undo | **Addressed in code**: verified across tools; user-confirmed working. |

### Vault — product

| ID | Topic | Notes |
|----|--------|------|
| N2 | Vault layout labels | **Addressed in code**: `VaultView` segmented control is emoji-only — 🌳 tree (file tree + editor), 🗂️ browse (grid/list); `aria-label` + `title` for a11y. No “Notes” / “Browse” text. |

### File browser

| ID | Topic | Notes |
|----|--------|------|
| F1 | Move action | **Addressed in code**: `MoveToFolderDialog` — folder tree, lazy children, new folder, root option. |
| F2 | Context menu | **Addressed in code**: `FbFileCard` / `FbFileRow` spread `...rest` on the root `div` so Radix `ContextMenu.Trigger` props (`onPointerDown`, `onContextMenu`, `data-*`, etc.) reach the DOM; `onKeyDown` composed with upstream handler. Removed dummy `onContextMenu={() => {}}` from parent. |
| F3 | Delete confirmation | **Addressed in code**: `ConfirmDialog` (Radix) for single/batch delete. **User-verified** 2026-04-08. |
| F5 | Image thumbnails | **Addressed in code**: `getImageThumbnail` (`lib/file-browser/image-thumbnail.ts`) reads image bytes → blob URL, cached by path (mirrors PDF thumbnail pattern). Grid cards show 56×56 rounded preview; list rows show 20×20 inline thumbnail. Fallback: emerald `ImageIcon`. Verify png/jpg/gif/webp/svg in grid + list. |
| F7 | Add file flow | **Addressed in code**: New menu popover redesigned — "PDF" renamed to "File", subtitles removed from all items. File screen: drop zone + Browse button for importing files into vault, plus "Create blank PDF" shortcut using `pdfPageStyle` from vault config. PDF page style preference (Blank/Lined/Grid) added to Settings > Vault tab; `pdfPageStyle` field added to `VaultConfig`. Dot-grid hidden from UI (code retained). |
| F8 | Chrome toggles | **Addressed in code**: `MainSidebar` theme radiogroup is icon-only (no text labels; `title` + `aria-label`). `NoteEditorModeBar` Visual/Source are icon-only square toggles; export trigger is compact icon + chevron. |

### Vault file tree

| ID | Topic | Notes |
|----|--------|------|
| T1 | Image files | **Addressed in code**: tree opens images as `EditorTab` type `image`; `ImagePreviewTabPane` uses `ImageEditorView` for png/jpg/jpeg/webp (edit + save) and `VaultImageView` for gif/svg/bmp/ico. Verify raster edit save + thumbnail refresh. |

### Markdown / notes editor

| ID | Topic | Notes |
|----|--------|------|
| M1 | Export vs print | **Addressed in code**: Print path labeled **Print** (not “export PDF”); `onPrint` + `handlePrint` in `markdown-note-editor.tsx`; subtitle “Opens print dialog — save as PDF”; toasts use print-oriented copy. Pipeline unchanged: `buildExportHtml` + `printExportHtml`. |
| M2 | Export formats | **Addressed in code**: mode bar export dropdown (Radix, `modal={false}`) — **Markdown** downloads `.md` (`downloadTextFile`); **Print** runs `printExportHtml`. Works from Visual or Source. Verify downloads + print dialog. |

### PDF viewer / editor

| ID | Topic | Notes |
|----|--------|------|
| P1 | Outline panel | **Superseded by `PdfSideColumn`**: outline is the **Outline** tab beside **Pages**; same collapsible column and **Layers** rail. Older standalone outline column + toolbar toggle removed. Verify bookmark navigation from Outline tab. |
| P3 | Text annotation UX | **Addressed in code**: placing **Text box** calls `setActiveTool(Select)` (canvas parity); hint row under toolbar when Text is active; toolbar `title` explains flow; FreeText `editable: true`; sync to store on `text:editing:exited` + `object:modified`. Verify place → Select highlighted → double-click edit → save. |
| P4 | Pen after highlighter | **Addressed in code**: `highlightColor` vs `drawColor` in `usePdfStore` (defaults `#fff3bf` / `#000000`); Draw swatches prepend **Black**; switching Highlight → Draw uses saved pen color, not highlight. Reset restores both. |
| P5 | Annotations on file | **Addressed in code**: `writeAnnotationsIntoPdf` draws highlight, ink, FreeText, and stamp **images** into page content (pdf-lib); **PDF text comments** use native `/Text` annotations (`Contents` + `InkMarrow` strip), not content-stream drawing. **Pen/ink**: Fabric paths (incl. curve segments) are flattened to polylines via `fabric-path-to-pdf-points.ts` before `drawLine`. Autosave (vault interval + optional blur) reloads the file after write so raster + native layers stay in sync and InkMarrow notes are **not duplicated** on the next save. Loader uses `addAnnotation(..., { fromLoader: true })` so native `/Highlight`/`/Ink` from disk do not flip **unsaved**. Expectation: graphics persist in any viewer; re-editable overlay for annotations pdf.js returns (`tests/pdf-annotation-writer.test.ts`). |
| P6 | Comment tool | **Addressed in code**: Radix `PdfCommentDialog` (textarea, Ctrl+Enter); `PdfPageCommentRail` beside each page (stacked cards, dashed separator). Verify Comment tool → dialog → margin + yellow marker. |
| P7 | Saved comments | **Addressed in code**: `writeAnnotationsIntoPdf` writes `/Text` with `Contents` + `InkMarrow` (strip old app notes before rewrite); `readPageAnnotations` maps `subtype === 'Text'`. Verify autosave → reload / external viewer shows sticky contents. |
| P8 | Signature UX | **Addressed in code**: after place, `setActiveTool(Select)` (parity with Text/Comment); stamp only via store rebuild (no duplicate Fabric add); `object:modified` → `updateAnnotation` for `Stamp` rect (move/scale persists on autosave). Verify place → drag in Select. |
| P9 | Add page | **Addressed in code**: toolbar **Add page** uses `appendBlankPage` (insert at `getPageCount()` from loaded bytes) so the index never lags React `pages.length` after a prior op/reload; `applyPageOp` surfaces failures with `toast.error`. Verify rapid double-click appends two pages at the end. |
| P10 | Form fields | **Addressed in code**: `getFormFields` wraps load/read in try/catch → `[]` (no red “could not read”); `PdfFormDialog` explains no fields are normal; save errors use muted panel copy; `pdfBytes` null → short wait message. Verify plain PDF → Form fields → calm empty state. |
| P11 | Text search | **Addressed in code**: `searchPdfDocument` uses pdf.js `getTextContent` (case-insensitive substring); debounced bar with Prev/Next, match counter, Enter / Shift+Enter; green/blue overlays on canvas (`PdfPageCanvas` `searchHighlights`). Scanned/image-only PDFs have no extractable text — expect “No matches”. |
| P14 | Colour palettes | **Addressed in code**: `usePdfStore` adds `textColor` + `setTextColor`; `PdfToolbar` shows three palettes — pastel **Highlight**, **Pen** (black + pastels), **Text** (inks: black/grays + saturated hues); FreeText uses `textColor` only. Hint row mentions text colour. Verify each tool keeps its swatch when switching tools. |
| P15 | PDF toolbar / page UX | **Addressed in code**: Removed toolbar Save, Flatten, and Side panel; added **Undo/Redo** for page ops (`PdfUndoStack`, `Ctrl+Z` / `Ctrl+Shift+Z`). Page thumbnails render offscreen then blit to visible canvas to reduce flash. `PdfViewer` autosave reads `VaultConfig.autoSave`. |

### Older notes (pre-ID)

- File browser: macOS-like selection, Shift/Cmd range, rubber band (see repo history).
- Canvas LAUNCH notes from 2026-04-02: some toolbar/text items may be superseded by the tables above.

---

## How to use this file

- Add rows under **Open deferrals** when you find a launch gap; use **IDs** in commits/PRs (e.g. `LAUNCH: P9 Add page broken`).
- When code fixes an item, move the row from **Open deferrals** to **Addressed in code (archive)** and add any new **Manual verification** lines under **To do**.
- Keep `DEVELOPMENT_PHASES.md` as phased roadmap (open vs completed archive; manual verification section links here).
- After UX or behavior changes: refresh **Manual verification → To do** and mention the list in PR/chat.
