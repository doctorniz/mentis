/**
 * Hands-on QA checklist content, served by `pnpm qa`
 * (scripts/qa-checklist-server.mjs).
 *
 * Curated from docs/LAUNCH_DEFERRALS.md's manual-verification queue plus
 * the 2026-07 hardening work. Item ids are STABLE KEYS for saved state
 * (.qa-checklist-state.json) — edit titles/steps freely, but rename an
 * id only if you accept losing its recorded status.
 */

export const checklist = {
  updated: '2026-07-14',
  sections: [
    /* ---------------------------- DESKTOP ---------------------------- */
    {
      id: 'canvas-selection',
      title: 'Canvas — selection & clipboard',
      device: 'desktop',
      items: [
        {
          id: 'sel-feel',
          title: 'Marquee + move feel (mouse / stylus)',
          steps: [
            'Open a .canvas, draw a few strokes, press M',
            'Drag a marquee, then drag inside it to move pixels — outline and pixels track the cursor',
            'Cursor shows "move" inside the marquee, crosshair outside',
            'Esc mid-drag returns pixels to source; Esc again clears the selection',
            'If you have a pen/tablet: repeat the move with the stylus',
          ],
        },
        {
          id: 'sel-zoom-pan',
          title: 'Move under zoom + pan',
          steps: [
            'Zoom to ~150% and pan the canvas',
            'Marquee + move a stroke — pixels land exactly where dropped, no drift',
            'Zoom while a selection exists — the outline stays 1px and aligned',
          ],
        },
        {
          id: 'sel-clipboard',
          title: 'Delete / copy / cut / paste / nudge',
          steps: [
            'Select a region: Delete erases it; Ctrl+Z brings it back',
            'Ctrl+A selects all; Ctrl+X empties the layer; Ctrl+V restores at the same spot',
            'Paste is selected immediately — drag it somewhere else',
            'Arrow keys nudge 1px, Shift+arrows 10px; hold a key — motion stays smooth; one Ctrl+Z undoes the whole burst',
            'Nudge then immediately switch tabs (<0.5s): the un-committed burst rolls back by design',
          ],
        },
        {
          id: 'sel-constrain',
          title: 'Selection constrains painting',
          steps: [
            'Make a selection, switch to Brush — the selection persists',
            'Stroke across the edge: paint appears only inside (live preview too)',
            'Soft brush (low hardness) at the edge — clipping looks acceptable',
            'Eraser inside a selection only erases inside (a few px of soft edge at the boundary is expected)',
            'Fill inside the selection stops exactly at its edges; Fill clicked outside does nothing',
          ],
        },
      ],
    },
    {
      id: 'canvas-maintenance',
      title: 'Canvas — maintenance & regressions',
      device: 'desktop',
      items: [
        {
          id: 'cleanup-real-vault',
          title: 'Unused-data cleanup on your real vault (drawings + PDF snapshots)',
          steps: [
            'Edit a PDF (creates a _marrow/snapshots/ backup), then delete that PDF',
            'Close all canvas tabs, open Settings → Vault → Maintenance',
            'Click "Clean up" — note the toast count',
            'Reopen a few canvases: every layer renders (nothing live was reaped)',
            'The deleted PDF\'s snapshots are gone; snapshots of PDFs you kept remain',
            'Click again: "Nothing to clean"',
          ],
        },
        {
          id: 'eyedropper',
          title: 'Eyedropper samples the clicked pixel (regression)',
          steps: [
            'Draw strokes in 2–3 distinct colors',
            'Press I and click each stroke — the brush color matches what you clicked, not the canvas corner',
          ],
        },
        {
          id: 'multi-stroke-undo',
          title: 'Multi-stroke undo/redo (regression)',
          steps: [
            'Draw 4–5 overlapping strokes across the middle of the canvas',
            'Undo all, redo all — strokes come back exactly in place, no shifted or duplicated copies',
          ],
        },
        {
          id: 'canvas-legacy',
          title: 'Canvas general sweep',
          steps: [
            'Brush size via [ ] and slider; color via palette + hex; layer add/rename/lock/opacity/blend',
            'Merge down + flatten + clear layer, undo each',
            'Rename the .canvas inline — no errors, strokes intact after reopen',
            'Rapid tab switching — drawings persist, no blank canvas',
            'Export PNG and PDF',
          ],
        },
      ],
    },
    {
      id: 'search-s5',
      title: 'Search — DOCX & code content',
      device: 'desktop',
      items: [
        {
          id: 'search-code',
          title: 'Code file search',
          steps: [
            'Add a .ts/.py file with a distinctive identifier, save',
            'Ctrl+F (vault search): the identifier finds the file; title shows its extension',
            'camelCase terms match; "foo.bar" matches via its parts (tokenizer splits on punctuation)',
          ],
        },
        {
          id: 'search-docx',
          title: 'DOCX search',
          steps: [
            'Drop a real .docx into the vault, reload the app (index rebuilds on vault open)',
            'Search a phrase from its body — found with a highlighted snippet',
            'A very large docx (>14k chars) still matches on early content',
            'Result icons look right per type (branch=mindmap, table=sheet, etc.)',
          ],
        },
      ],
    },
    {
      id: 'chat-pdf',
      title: 'Chat — PDF thread recovery',
      device: 'desktop',
      items: [
        {
          id: 'pdf-rename-recovery',
          title: 'OS rename between sessions keeps threads (AI5)',
          steps: [
            'Open ✨ chat on a PDF (FSAPI vault), send a message',
            'Close the app/tab entirely; rename the PDF in the OS file browser',
            'Reopen the vault, open chat on the renamed PDF — the old thread reappears',
            '_marrow/_chats/index.json shows schemaVersion 2 with size/hash fields',
          ],
        },
        {
          id: 'pdf-chat-basics',
          title: 'Per-document chat basics',
          steps: [
            'Markdown note: ✨ chat mints chatAssetId into frontmatter (check Source mode)',
            'Rename the note in-app — thread survives',
            'PDF chat answers are grounded in the PDF text',
            'Esc cancels a streaming reply; thread JSON exists under _marrow/_chats/',
          ],
        },
      ],
    },
    {
      id: 'sync-dropbox',
      title: 'Sync — Dropbox pass',
      device: 'desktop',
      items: [
        {
          id: 'sync-excludes',
          title: 'Exclude patterns (S3)',
          steps: [
            'Connect a vault that previously synced snapshots; run a full sync',
            'Dropbox: NO new uploads under _marrow/snapshots/ or search-index.json',
            'Pre-existing remote snapshot copies are NOT deleted',
            'Normal notes still push and pull',
            'Add "excludePaths": ["some-folder"] to config.json sync section — that folder stays local both ways',
          ],
        },
        {
          id: 'sync-conflict-toast',
          title: 'Conflict toast (S4)',
          steps: [
            'Edit the same note on two devices/browsers between syncs',
            'Full sync: exactly one toast names the file and which version won',
            'One-sided edits sync silently (no toast)',
          ],
        },
        {
          id: 'sync-no-clobber',
          title: 'Poll no-clobber (S6)',
          steps: [
            'Go offline; edit + save a note (push fails silently)',
            'Change the same note remotely (other device)',
            'Go back online, wait for a poll: local edit survives (conflict toast decides), not silently overwritten',
            'Remote-delete a file that has unpushed local edits — the local edit survives and re-uploads',
          ],
        },
      ],
    },
    {
      id: 'organizer',
      title: 'Organizer — Tasks / Calendar / Board / Bookmarks',
      device: 'desktop',
      items: [
        {
          id: 'tasks',
          title: 'Tasks',
          steps: [
            'Quick-add: "!1 Fix bug #work >tomorrow" parses priority/tag/due; "every tuesday" shows the weekly chip',
            'Detail dialog: edit fields, subtasks, move between lists; export .ics',
            'Complete a repeating task — due rolls forward',
          ],
        },
        {
          id: 'calendar',
          title: 'Calendar',
          steps: [
            'Week view: title is month+year; header/grid lines align',
            'Create/edit/delete events; task due dates show as grey chips',
            'Month → click a day pre-fills New Event',
          ],
        },
        {
          id: 'board',
          title: 'Board',
          steps: [
            'Add/edit/delete thoughts; color picker via right-click; image card; voice note records and plays',
            'Transcribe a voice note (first run downloads Whisper)',
            'Move to Vault: text→md, voice→mp3, image-only→image; opens in Vault after',
          ],
        },
        {
          id: 'bookmarks',
          title: 'Bookmarks',
          steps: [
            'Add bookmark by URL — OG title/favicon/image fetched (or degrades gracefully)',
            'Categories add/move; edit + delete via hover icons',
          ],
        },
      ],
    },
    {
      id: 'editors',
      title: 'Editors — Markdown / PDF / others',
      device: 'desktop',
      items: [
        {
          id: 'md-images',
          title: 'Markdown image resize/alt',
          steps: [
            'Click an embedded image → accent ring; drag corner handle to resize (px readout)',
            'Alt chip edits alt text; Source mode shows ![alt|400](path)',
            'Reopen: width persists; print/export uses it',
          ],
        },
        {
          id: 'pdf-suite',
          title: 'PDF quick sweep',
          steps: [
            'Highlight / draw / text / comment / sign — each persists after reload; no duplicate strokes on double-save',
            'Pages tab: reorder, extract multi-select; Add page twice appends two',
            'Per-tool colors stay separate; find-in-PDF jumps to matches',
          ],
        },
        {
          id: 'other-editors',
          title: 'Kanban / Mindmap / Spreadsheet / DOCX',
          steps: [
            'Kanban: drag cards + columns, colors, reopen intact',
            'Mindmap: Tab/Enter/F2/Delete keys, drag connect, cycle rejected with toast',
            'Spreadsheet: multi-sheet edit, switch sheets without losing edits, csv stays csv',
            'DOCX: edit + reopen; zoom follows pane width',
          ],
        },
      ],
    },
    /* ----------------------------- MOBILE ---------------------------- */
    {
      id: 'mobile-canvas',
      title: 'Canvas touch',
      device: 'mobile',
      items: [
        {
          id: 'm-pinch',
          title: 'Pinch-zoom & two-finger pan',
          steps: [
            'Open a canvas; pinch to zoom at the pinch point; two-finger drag pans',
            'Start a one-finger stroke, land a second finger: the stroke aborts cleanly, no paint blob',
            'Draw after the gesture ends — works immediately',
          ],
        },
        {
          id: 'm-selection',
          title: 'Selection by touch',
          steps: [
            'Select tool: drag a marquee by finger, then drag inside to move pixels',
            'Two-finger gesture mid-move aborts it (pixels return)',
          ],
        },
        {
          id: 'm-canvas-layout',
          title: 'Canvas layout on narrow screens',
          steps: [
            'Drawing area has visible height, neutral backdrop',
            'Switch away and back: strokes repaint (not blank white)',
          ],
        },
      ],
    },
    {
      id: 'mobile-nav',
      title: 'Navigation & drawers',
      device: 'mobile',
      items: [
        {
          id: 'm-drawers',
          title: 'Masthead + section drawers',
          steps: [
            'Hamburger opens the app nav sheet; every section reachable',
            'Vault tree / task lists / bookmark categories / chat threads open as drawers with the section\'s own icon',
            'Opening a file from the vault drawer closes the drawer',
            'Escape / scrim tap closes; focus stays trapped while open',
          ],
        },
        {
          id: 'm-calendar',
          title: 'Calendar on mobile',
          steps: [
            'Defaults to day view',
            'Week grid pans horizontally instead of crushing columns',
            'Toolbar wraps without overlapping',
          ],
        },
        {
          id: 'm-safe-area',
          title: 'Safe areas & feel',
          steps: [
            'No content under notch/home indicator in PWA/standalone',
            'Drawer swipe/scroll feels right; no accidental body scroll behind overlays',
          ],
        },
      ],
    },
    {
      id: 'mobile-misc',
      title: 'Mobile misc',
      device: 'mobile',
      items: [
        {
          id: 'm-docx-doubletap',
          title: 'DOCX double-tap word select',
          steps: ['Open a .docx, double-tap a word — it selects (synthetic dblclick path)'],
        },
        {
          id: 'm-pwa',
          title: 'PWA / offline smoke',
          steps: [
            'Install/standalone launch works; icon correct',
            'Airplane mode: app shell loads, vault opens, notes editable',
          ],
        },
      ],
    },
  ],

  /* -------------------------- FUTURE WORKS -------------------------- */
  futureWorks: [
    { id: 'f-hsl', title: 'Canvas HSL blend modes (BUG-16)', note: 'hue/saturation/color/luminosity currently fall back to normal; needs a Pixi filter pass.' },
    { id: 'f-embed-rag', title: 'Embeddings RAG (AI1)', note: 'Transformers.js + local vector store; better paraphrase recall at ~100MB model cost.' },
    { id: 'f-ocr', title: 'Canvas OCR for search/RAG (AI2)', note: 'Drawings are only indexed by title today.' },
    { id: 'f-tools', title: 'Chat tool-calling / writes (AI4)', note: 'Both chat surfaces are read-only; agents deferred until vault chat UX settles.' },
    { id: 'f-mobile-export', title: 'Mobile export (X1)', note: 'RN/Capacitor wrapper; keep web architecture compatible.' },
    { id: 'f-image-tools', title: 'Image editing tools (T2)', note: 'Photoshop-like image tooling; roadmap only.' },
    { id: 'f-conflict-ui', title: 'Sync conflict details UI', note: 'Conflict toast exists; a history/details surface does not.' },
    { id: 'f-snapshot-reaper', title: 'Snapshot reaper', note: '_marrow/snapshots/ grows unbounded; needs age/size policy (deliberately NOT part of drawing cleanup).' },
    { id: 'f-canvas-expand', title: 'Canvas left/up expansion', note: 'Auto-expand only grows right/down; left/up needs pixel offsetting.' },
    { id: 'f-e2e-flakes', title: 'E2E flake hardening', note: 'Baseline single-retry flakes under CI parallel load (e.g. 05-canvas 5.2.8); a dedicated pass could remove retries.' },
  ],
}
