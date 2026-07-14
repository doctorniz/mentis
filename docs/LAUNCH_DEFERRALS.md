# Pre-launch deferrals

Items are **logged for review before public launch**. This file is **pre-launch triage** (UX polish, PDF/canvas parity, mobile export).

**Structure**

1. **Open deferrals** — work still open or “landed, confirm in UI.”
2. **Manual verification** — human checklists: **To do** (`- [ ]`) vs **Done** (`- [x]`).
3. **Addressed in code (archive)** — historical fixes; reopen a row under **Open deferrals** or **To do** if something regresses.

**Workflow**

- New gap — add under **Open deferrals** with an ID (e.g. `LAUNCH: P9 Add page broken`).
- Fixed — move to **archive**; add or refresh **Manual verification** bullets in the same change when behavior should be re-checked.
- PRs: repeat **To do** items under **Manual verification** so assignees see them.
- Phased roadmap: `DEVELOPMENT_PHASES.md` (links here for verification).

---

## Open deferrals

### Product / engineering

| Area       | ID   | Topic                   | Notes                                                                                                                                                                                                             |
| ---------- | ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vault tree | T2   | Image editing tools     | Photoshop-like image tooling — roadmap only.                                                                                                                                                                      |
| Cross      | X1   | Mobile export           | Keep web architecture compatible with RN/Capacitor; document in `ARCHITECTURE.md` when chosen.                                                                                                                    |
| Chat       | AI1  | Embeddings RAG          | Vault chat v1 uses MiniSearch (lexical) for retrieval. True embeddings (Transformers.js + local vector store) deferred to tier 2 — better recall on paraphrased questions at the cost of a ~100MB model download. |
| Chat       | AI2  | Canvas content RAG      | MiniSearch indexes canvas titles/paths only, not pixel or stroke data. Vault chat will not retrieve drawing content until an OCR/caption pass is added.                                                           |
| Chat       | AI3  | Local model download UX | Local (`device`) provider is Gemma 4 E2B only (MediaPipe/OPFS). Status row: while downloading, subtitle must not claim “cached”; Ready uses green tick styling. Requires WebGPU.                                  |
| Chat       | AI4  | Tool calling / writes   | Both chat surfaces are read-only — no document edits, file creation, or multi-step agents. Deferred until after vault chat UX settles.                                                                            |
| Canvas     | C-UX | Canvas remaining polish | The 2026-07 canvas program shipped tiers 1–8 plus selection/clipboard, constrained painting, and the orphan reaper. Still open: **HSL blend modes** (hue/saturation/color/luminosity fall back to `normal` — BUG-16, needs a Pixi filter pass), **left/up auto-expansion** (needs pixel offsetting; only right/down grows today), and canvas OCR (tracked as AI2). |
| Sync       | S7   | Conflict details UI     | The conflict toast (S4) names the kept version, but there is no conflict-history surface to review past conflicts or recover the losing version (the losing local bytes are not preserved).                        |
| Testing    | E2E2 | Flake hardening         | Baseline single-retry flakes under CI’s parallel software-GL load (e.g. `05-canvas` 5.2.8). CI retries absorb them; a dedicated pass could remove the need for retries.                                            |

### Addressed in code — confirm in UI

| Area         | ID  | Notes                                                              |
| ------------ | --- | ------------------------------------------------------------------ |
| File browser | F4  | Batch toolbar must not shift grid/list (double-click still opens). |
| File browser | F6  | Drop-import overlay: drag enter/leave should not stick.            |

---

## Manual verification queue

**Format:** `- [ ]` = to run; `- [x]` = verified (keep a short date when useful).

**Hands-on passes:** run `pnpm qa` — a dev-only checklist server (Desktop / Mobile / Future tabs, pass/fail/skip + notes, findings export) curated from this queue. It binds to the LAN so a phone can drive the Mobile tab; progress is shared and survives restarts (`.qa-checklist-state.json`, git-ignored). Keep `scripts/qa-checklist-data.mjs` in sync when this queue gains hands-on items.

### To do

- [ ] **Chat — PDF rename reconciliation (AI5)** — open ✨ chat on a PDF, send a message, close the app, rename the PDF in the OS file browser, reopen, open chat on the renamed PDF → the old thread reappears; `_marrow/_chats/index.json` shows schemaVersion 2 with `size`/`hash` fields. (Unit-tested: `tests/chat-asset-index.test.ts`.)
- [ ] **Sync — exclude patterns (S3)** — with a vault that previously synced snapshots, run a full sync: no new `_marrow/snapshots/*` or `search-index.json` uploads; pre-existing remote copies are NOT deleted; normal notes still push/pull; a custom `sync.excludePaths` folder is skipped both ways. (Unit-tested: `tests/sync-excludes.test.ts`.)
- [ ] **Sync — conflict toast (S4)** — edit one note on two devices between syncs; full sync shows exactly one toast naming the file and the kept version; one-sided edits stay silent. (Unit-tested: `tests/sync-conflicts.test.ts`.)
- [ ] **Sync — poll no-clobber (S6)** — offline-save a note (push fails), change it remotely, go online: the next poll conflict-checks instead of silently overwriting; a locally-edited file survives a remote delete. (Unit-tested: `tests/sync-conflicts.test.ts` delta-decision branches.)
- [ ] **Vault — snapshot cleanup (V1)** — edit a PDF (creates `_marrow/snapshots/*`), delete the PDF, then Settings → Vault → Maintenance → **Clean up**: the deleted PDF's snapshots are removed and live PDFs' snapshots older than `retentionDays` / beyond `maxPerFile` are trimmed, while recent live-PDF snapshots survive. (Unit-tested: `tests/snapshot-reaper.test.ts`, incl. the dashed-timestamp retention regression.)
- [ ] **Canvas — selection & clipped painting feel** — move under zoom/pan on real hardware, stylus/touch move, soft-brush strokes at the selection edge, hold-key nudge repeat feel, paste onto a smaller canvas, cross-canvas paste. (Pixel-exact behavior automated in `tests/e2e/21-canvas-selection.spec.ts`.)
- [ ] **Canvas — regressions eyeball** — eyedropper samples the clicked pixel; multi-stroke undo/redo leaves no shifted/duplicated content (both were shipped bugs fixed 2026-07-12); drawing-data Clean up on a real long-lived vault, then reopen canvases.
- [ ] **Search — DOCX + code hands-on** — punctuation-heavy code terms (tokenizer splits on non-word chars), a >14k-char `.docx` (truncates), per-type icons in the vault search panel.
- [ ] **Markdown editor — image resize/alt** — drag-resize with px readout; Alt chip; Source shows `![alt|400](path)`; width persists and prints. (Pipe-width round-trip unit-tested; drag UI needs hands.)
- [ ] **Board** — thought CRUD, color picker, inline edit, image + voice cards, transcription; **Move to Vault** exports voice→audio file, image-only→image file, text→markdown.
- [ ] **Audio / Whisper** — first transcribe downloads whisper-tiny (no 401), progress events fire, transcript persists.
- [ ] **Bookmarks** — add via URL (OG fetch or graceful degrade), categories, edit/delete.
- [ ] **Calendar** — week title month+year, aligned grid, event CRUD, task-due chips, day/week/month.
- [ ] **Tasks** — quick-add parsing (`!1`, `#tag`, `>tomorrow`, `every tuesday`), detail dialog, subtasks, lists, `.ics` export, recurrence roll-forward.
- [ ] **Kanban** — create from New menu, drag cards/columns, colors, reopen, external readability.
- [ ] **Mindmap** — keyboard editing (Tab/Enter/F2/Delete), drag-connect with cycle rejection, undo, persistence, mobile FAB/pinch.
- [ ] **Chat — Settings tab** — per-provider key hints; keys round-trip through IndexedDB and NEVER appear in `config.json`.
- [ ] **Chat — per-document panels** — `chatAssetId` minting (frontmatter for md, index.json for PDF), thread persistence across rename, resize divider, empty states, streaming + Stop, source links.
- [ ] **Chat — providers** — streaming round-trip per cloud provider (wire-format smoke checks); Ollama reachability error; Local Gemma download → Ready → coherent streaming without word-gluing; WebGPU error message on unsupported browsers.
- [ ] **Vault chat (Ctrl+0)** — sidebar resize/collapse persistence, session thread memory, centered empty-state composer, Sources list only for cited excerpts, image uploads.
- [ ] **Vault & files** — Preview/Files tabs, sync icon when Dropbox configured, Unicode filenames over sync, browse header path, file-browser context menu + batch ops, image edit from tree, vault rename round-trip (C18), New menu (note/file/drawing/PDF import with page style).
- [ ] **Canvas — general sweep** — brushes/sizes/colors, layer operations (add/rename/lock/opacity/blend/merge/flatten/clear + undo), inline rename, rapid tab switching, export PNG/PDF, keyboard map (M/B/E/H/G/I, `[`/`]`, Ctrl+Z/Y/S, Esc, Del, Ctrl+A/C/X/V, arrows).
- [ ] **Canvas (mobile / narrow)** — visible drawing area, repaint after view switches, pinch-zoom/two-finger pan, gesture aborts strokes and selections.
- [ ] **PDF suite** — side column (P2), text boxes, pen vs highlight colors (P14), autosave (P12/P13/P15), persistence + thumbnails, comments (P6/P7), signatures (P8), add page (P9), forms (P10), text search (P11).
- [ ] **Backlinks section** — wide vs narrow layout in the unified right column; collapse persistence; resize edge cases.
- [ ] **Notes vault tree** — collapse/expand, mobile drawer, DnD refresh (C21), context menu (C21b).
- [ ] **Sync — Settings & OAuth** — Sync tab connect/disconnect, `/auth/dropbox` return, push-after-save without a separate enable toggle, remote edits pull on poll.
- [ ] **Branding / license** — Mentis naming everywhere, favicon/PWA icon, README + LICENSE agreement.

### Done

- [x] **CI failures fixed** (2026-07-13) — Monday-only strict-mode collision in `07-tasks`; canvas undo polling race (poll full pixel state with fringe tolerance, not count alone). Suite green on static export.
- [x] **QA checklist server** (2026-07-14) — `pnpm qa`; see header note above.
- [x] **Canvas — drawing-data cleanup (orphan reaper)** (2026-07-13, automated: `tests/e2e/15-settings.spec.ts` 16.5, `tests/orphan-reaper.test.ts`) — corrupt-canvas aborts reap; live data untouched; idempotent second run; refuses with a canvas tab open.
- [x] **Search — DOCX + code content (S5)** (2026-07-13, automated: `tests/e2e/11-search.spec.ts` 11.6, `tests/docx-code-index.test.ts`).
- [x] **Canvas — selection program** (2026-07-12, automated: `tests/e2e/21-canvas-selection.spec.ts`, pixel-level) — marquee + move (incl. under zoom/pan), delete/copy/cut/paste/select-all, arrow-key nudge with single-undo bursts, move cursor, selection persists across tools and constrains brush/eraser/fill. Shipped bugs fixed en route: Pixi `extract.canvas` ignores `frame` for RT targets (region undo restored shifted; eyedropper sampled (0,0)).
- [x] **Responsive layout consistency** (2026-07-11, automated: `tests/e2e/19-responsive.spec.ts`) — one mobile breakpoint, shared `MobileDrawer`, calendar day-default + horizontal pan.
- [x] **Mobile Playwright project repaired (E2E1)** (2026-07-11) — Pixel 5 project runs `20-mobile.spec.ts` in CI; drawer closes on file open.
- [x] **E2E suite (chromium) repaired** (2026-07-09) — fixtures rebuilt against the real nav; four real app bugs fixed en route (delete-resurrection, settings draft reset, PDF overflow, kanban a11y).
- [x] **Markdown editor extras** (2026-07-08, automated: `18-markdown-editor-extras.spec.ts`) — find/replace, outline panel, mode-switch scroll, table controls + word count, slash-menu Escape. Do not reintroduce Tiptap BubbleMenu for the table toolbar (tippy reparenting crashed the editor).
- [x] **Keyboard shortcuts dialog** — Ctrl+Shift+? lists current nav.
- [x] **Notes chrome (F8 / M1)**; **mobile main nav**; **file-browser thumbnails (F5) + delete (F3)**; **vault tree DnD (C21)**; **canvas image undo (C19/C20)**; **FSAPI vault persistence** — all verified April 2026.

---

## Addressed in code (archive)

Historical record — resolved items with their resolution notes. Reopen a row above if something regresses.

### 2026-07 hardening program

| Area    | ID   | Resolution                                                                                                                                                                                                                                                                                        |
| ------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat    | AI5  | **PDF rename → asset-id (2026-07-13).** Chat index schema v2 stores a size+SHA-256 fingerprint per entry; a unique dangling fingerprint match at chat-open adopts the old id (threads restored). Copies/ambiguous/edited-after-rename mint fresh ids. In-app renames also call `movePdfChatAssetId`. |
| Search  | S5   | **DOCX / code content (2026-07-13).** `extractDocxText` (JSZip + `<w:t>`), code bodies with extension-keeping titles; `isIndexableTextPath` type-driven; legacy full-page search view removed (it silently dropped non-md/pdf/canvas results); live panel got per-type icons.                       |
| Sync    | S3   | **Exclude patterns (2026-07-13).** `_marrow/snapshots` + `search-index.json` invisible to sync both ways; `sync.excludePaths` for extras; stale manifest rows purge without remote deletes. See CLOUD_SYNC.md.                                                                                      |
| Sync    | S4   | **Conflict toast (2026-07-13).** `SyncManager.onConflict` fires once per file per run for TRUE conflicts; toast names the kept version; policy extracted to `lib/sync/conflicts.ts` (unit-tested). Details UI tracked as S7.                                                                        |
| Sync    | S6   | **Poll-pull clobber (2026-07-13).** Delta path shares full sync’s policy via `decideRemoteUpdate`/`decideRemoteDelete`; unpushed local edits conflict-check instead of being overwritten; local edits survive remote deletes.                                                                       |
| Vault   | V1   | **Snapshot reaper (2026-07-15).** `reapSnapshots` (`lib/snapshot`) reaps snapshots whose owner PDF is gone (ownership by basename, `_marrow` skipped so a snapshot isn't its own owner) plus live-owner overflow; folded into the Settings → Maintenance "Clean up" action alongside the canvas reaper. Fixed a latent bug: `pruneSnapshots` compared the dashed snapshot timestamp with `new Date()` (always `Invalid Date`), so `retentionDays` never actually fired — now routed through `parseSnapshotTimestamp`. Conservative: vault scan completes before any delete. |
| Canvas  | —    | **2026-07 canvas program.** Tiers 1–8 (correctness + performance), pinch-zoom + zoom UI, layer merge/flatten/clear, fill tolerance, shift-line, cursor ring, stabilizer, selection/clipboard/constrained painting (see Done above), orphan reaper (Settings → Vault → Maintenance).                 |
| Testing | E2E1 | **Mobile Playwright project (2026-07-11).** Pixel 5 project in CI; fixtures wait on `:visible` shell selectors.                                                                                                                                                                                    |
| Sync    | S2   | Nextcloud removed from product; Dropbox OAuth only.                                                                                                                                                                                                                                                |

### Canvas — UX & tools (April 2026, pre-PixiJS-rewrite era)

C1–C25 covered the original Fabric.js canvas (text cards, stickies, connectors) and its retirement; the canvas was later rewritten as the PixiJS raster editor. Kept for ID reference: C18 (rename collision → `vaultPathsPointToSameFile`), C21/C21b (tree DnD refresh + context menu), C22 (browse header) remain relevant to the current app; the rest is historical. Full detail in git history of this file and `docs/CANVAS_BUG_REPORT.md` (BUG-01…BUG-18) for the PixiJS triage.

### File browser / vault / markdown / PDF / sync (April–May 2026)

| ID              | Resolution                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1–F8           | Move dialog + folder rename, context-menu portal fix, delete confirm, thumbnails, new-file flow, chrome polish.                                  |
| T1              | Image files open as editor/preview by type.                                                                                                      |
| N2, M1, M2      | Tree/browse labels; print/export wording + pipeline.                                                                                             |
| P1–P15          | PDF program: side column (Pages/Outline), text tool, per-tool colours, comments + margin rail, signatures, add page, forms, text search, autosave-only toolbar, page-op undo/redo. Verify under **PDF suite** above. |
| S0, S1          | Dropbox sync engine (manifest, tokens, PKCE OAuth return).                                                                                       |
