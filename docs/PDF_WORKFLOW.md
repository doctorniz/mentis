# Ink by Marrow — PDF Workflow (Detailed UX)

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
3. Toolbar appears: **Select | Highlight | Draw | Text | Sign | Pages | Save**.
4. On first edit: a snapshot is silently saved to `_marrow/snapshots/`.
5. Edits are held in memory on the canvas overlay until save.
6. **Auto-save** writes all pending changes directly into the PDF file (default: every 30s or on blur).

## 4. Highlighting

1. User selects text with cursor (Select mode is default).
2. A floating toolbar appears: color picker (yellow, green, blue, pink, red) + "Add note" option.
3. On color click → highlight is rendered on canvas and written into the PDF as a standard `/Highlight` annotation on next save.
4. Clicking an existing highlight → edit note, change color, or delete.

## 5. Freehand Drawing

1. User selects **Draw** tool from toolbar.
2. Toolbar expands: pen color picker, thickness slider, eraser toggle.
3. Mouse/stylus strokes are captured as Fabric.js path objects on the canvas overlay.
4. Eraser tool removes individual stroke objects.
5. On save, strokes are written as `/Ink` annotations into the PDF.
6. Pressure sensitivity supported when stylus provides pressure data (Phase 3 priority).

## 6. Text Boxes

1. User selects **Text** tool from toolbar.
2. Click anywhere on the page to place a text cursor.
3. A text box appears — user types, formats (bold, italic), resizes.
4. On save, text boxes are written as `/FreeText` annotations into the PDF.

## 7. Comments

1. User selects **Comment** tool (or right-clicks in Select mode → "Add comment").
2. Click on a point in the page → comment icon appears, note editor opens.
3. User types comment text.
4. On save, comments are written as `/Text` (popup note) annotations.
5. Comment icons visible on the page; click to expand/edit/delete.

## 8. Signing

1. User clicks **Sign** in toolbar.
2. If no saved signatures: modal to draw signature on a canvas pad, or upload an image.
3. Signature saved to `_marrow/signatures/` for reuse.
4. Signature appears as a draggable, resizable stamp. User places it, clicks to confirm.
5. On save, signature is stamped into the PDF page as an embedded image (`/Stamp` annotation).
6. Multiple signatures supported (e.g., initials vs. full signature).

## 9. Page Management

1. User clicks **Pages** in toolbar → page panel slides open showing all page thumbnails.
2. Drag to reorder pages. Right-click for: insert blank page (before/after), delete page, rotate page.
3. **Merge**: drag another PDF from the file tree into the page panel to append its pages.
4. **Split**: select page range → "Extract to new PDF" creates a new file in the same folder.
5. All page operations are written into the PDF on save.

## 10. Form Filling

1. PDF.js detects interactive form fields (text inputs, checkboxes, radio buttons, dropdowns).
2. Fields are rendered as editable overlays on the page.
3. User fills in values → on save, values are written into the PDF form data.
4. "Flatten form" option bakes filled values as static content (removes editability).

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
2. **Download** gives the user the file as-is.
3. **Flatten** option removes annotation editability (stamps everything as static content). Creates a new flattened copy, preserving the editable original.
4. **Print** sends the current state to the system print dialog.

## 13. Auto-Save Lifecycle

```
Editor idle for 30s OR window blur OR Cmd+S
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
