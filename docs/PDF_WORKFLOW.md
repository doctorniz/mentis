# Mentis — PDF Workflow (Detailed UX)

This document describes product behaviour for **Mentis**. Repository **licensing** (BSL 1.1) is defined in the root [`LICENSE`](../LICENSE); see also [`ARCHITECTURE.md`](./ARCHITECTURE.md) §10.

## 1. File Browser View (PDFs)

1. User switches to the **File Browser** view from the sidebar.
2. Grid view shows thumbnail previews of every PDF in the vault. List view shows name, folder, page count, size, and last modified date.
3. Sort by: name, date modified, date added, size, folder.
4. Filter by: folder, tags.
5. Search bar filters PDFs by filename and (if indexed) extracted text content.
6. Right-click context menu: Open, Move, Rename, Duplicate, Delete, Merge selected, Export.
7. Drag-and-drop from desktop imports a PDF into the currently viewed folder (or `_inbox/` if no folder selected).

## 2. Importing PDFs

1. Drag-and-drop a PDF anywhere onto the app → import modal appears.
2. User chooses destination folder (default: `_inbox/`).
3. File is copied into the vault. Thumbnail is generated. Search index is updated.
4. Alternatively: **Import** button in toolbar opens a system file picker (multi-select supported).

## 3. Opening & Editing a PDF

1. User clicks a `.pdf` in the file tree or PDF browser.
2. PDF.js renders the document in the main pane. Existing annotations (from any PDF viewer) are detected and displayed as editable objects.
3. **Toolbar** (`PdfToolbar`): **Select | Highlight | Draw | Text | Comment | Sign**; colour/width controls per tool; zoom; page navigation and **Add page**; **Undo / Redo** (page operations only); **Form fields**; **Version history**; **Search**. **Pages** and **Outline** live in the left **side column** (`PdfSideColumn`) — expand/collapse via the column header and **Layers** rail, not the main toolbar.
4. On first edit: a snapshot is silently saved to `_marrow/snapshots/`.
5. Edits are held in memory on the Fabric overlay until **auto-save** runs (no dedicated Save button in the PDF toolbar).
6. **Auto-save** writes pending annotations into the PDF (default: every **5s** and optionally on window blur — see **Settings → Auto-save**; can be disabled or retimed).

## 4. Highlighting

1. User selects text with cursor (Select mode is default).
2. A floating toolbar appears: color picker (yellow, green, blue, pink, red) + "Add note" option.
3. On color click → highlight is rendered on the overlay and baked into the PDF page content on the next auto-save (visual parity with `/Highlight`).
4. Clicking an existing highlight → edit note, change color, or delete.

## 5. Freehand Drawing

1. User selects **Draw** tool from toolbar.
2. Toolbar expands: pen colour picker and thickness slider (no separate eraser in the PDF viewer today).
3. Mouse/stylus strokes are captured as Fabric.js paths on the overlay.
4. On auto-save, strokes are written into the PDF **page content** as line segments (`pdf-lib` `drawLine`). Fabric curve commands (`Q`/`C`) are flattened to polylines first (`fabric-path-to-pdf-points.ts`) so strokes persist reliably.
5. Pressure sensitivity when stylus provides pressure data remains a future enhancement.

## 6. Text Boxes

1. User selects **Text** tool from toolbar.
2. Click anywhere on the page to place a text cursor.
3. A text box appears — user types, formats (bold, italic), resizes.
4. On auto-save, text boxes are written as drawn text in the page content (FreeText parity).

## 7. Comments

1. User selects **Comment** tool (or right-clicks in Select mode → "Add comment").
2. Click on a point in the page → comment icon appears, note editor opens.
3. User types comment text.
4. On auto-save, comments are written as native `/Text` annotations (`InkMarrow` strip for idempotent re-save).
5. Comment icons visible on the page; click to expand/edit/delete.

## 8. Signing

1. User clicks **Sign** in toolbar.
2. If no saved signatures: modal to draw signature on a canvas pad, or upload an image.
3. Signature saved to `_marrow/signatures/` for reuse.
4. Signature appears as a draggable, resizable stamp. User places it, clicks to confirm.
5. On auto-save, the signature is stamped into the page content as an embedded image (stamp parity).
6. Multiple signatures supported (e.g., initials vs. full signature).

## 9. Page Management

1. Open the **Pages** tab in the **side column** (when the column is expanded). Thumbnails update via offscreen PDF.js render to reduce visible flash.
2. Drag thumbnails to reorder; use the panel toolbar for insert blank page (relative to current page), delete current page, rotate current page, and **merge** (file picker or drop PDF on the panel / merge zone).
3. **Extract pages**: multi-select thumbnails (Ctrl/Cmd+click, Shift+click for range) → **Save** icon in the panel toolbar writes the selection to a new PDF beside the original and opens it in a new tab.
4. **Undo / Redo** for page structure: main toolbar (or `Ctrl+Z` / `Ctrl+Shift+Z`); snapshots raw PDF bytes before each page op (`PdfUndoStack`).
5. All page operations write through to the vault file immediately (then the viewer reloads the PDF).

## 10. Form Filling

1. PDF.js detects interactive form fields (text inputs, checkboxes, radio buttons, dropdowns).
2. Fields are rendered as editable overlays on the page.
3. User fills in values → **Save** in the form dialog writes values into the PDF form data.
4. A dedicated **Flatten** export is **not** in the viewer toolbar today; `flattenPdf` exists in code for potential future export UX.

## 11. New PDF Note Creation

1. User picks "New PDF Note" from the New view.
2. Chooses page style: **Blank | Lined | Grid | Dot grid**.
3. Chooses page size: **A4 | Letter | Custom**.
4. Names the file, picks a destination folder.
5. A new `.pdf` is created via `pdf-lib` with the chosen background pattern.
6. User writes/draws on it with freehand tools.
7. Additional pages added on demand via the page panel.

### Page Style Specifications

| Style | Description |
|---|---|
| **Blank** | Pure white page, no lines or marks |
| **Lined** | Horizontal lines at 8mm intervals, with a left margin line |
| **Grid** | 5mm × 5mm square grid |
| **Dot grid** | Dots at 5mm intervals in a grid pattern |

## 12. Export & Share

1. The PDF is always in a shareable state — annotations are baked in.
2. **Download** (e.g. from the file browser or OS) gives the file as stored on disk — annotations from Mentis are already merged into the PDF on auto-save.
3. **Flatten** as a separate “download flat copy” action is not exposed in the PDF viewer UI currently.
4. **Print** uses the browser print dialog on the rendered view where applicable (same as other web content).

## 13. Auto-Save Lifecycle

```
Editor idle for the configured interval OR window blur (when enabled)
        │
        ▼
    Is this the first edit in session?
        │
    Yes ──► Create snapshot in _marrow/snapshots/
        │
        ▼
    Collect all dirty annotations from Fabric.js canvas
        │
        ▼
    Load current PDF bytes from FS
        │
        ▼
    pdf-lib: write annotations into PDF
        │
        ▼
    Write to temp file → atomic rename to target path
        │
        ▼
    Mark all annotations as clean
        │
        ▼
    Update last-saved timestamp in UI
```

## 14. Snapshot Retention

- Snapshots stored at: `_marrow/snapshots/<filename>_<ISO-timestamp>.pdf`
- Default retention: last 5 snapshots per file, or 30 days, whichever is reached first
- Pruning runs on vault open and after each snapshot creation
- Users can browse and restore snapshots from the PDF viewer's "Version History" menu
- Snapshots are opt-out (enabled by default) via `_marrow/config.json`
