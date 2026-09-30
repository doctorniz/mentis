# Mentis — project context

Local-first personal knowledge system. Every item of user data is an ordinary
file in a folder the user chooses. No database of record, no account required,
no cloud dependency.

Currently a Vite + React 19 static SPA (~50k LOC TS/TSX) storing files in OPFS.
Being migrated to a Tauri 2 application with real filesystem access.

## Non-negotiable principles

1. **Files are the only source of truth.** SQLite holds derived data only —
   search index, path manifest, cached hashes, expanded reminder occurrences.
   Deleting the database must lose nothing. Never introduce state that exists
   only in a database.
2. **Nothing loads until it is needed.** Every file-type handler is a lazily
   imported module. Opening a markdown note must not load the PDF engine, the
   drawing canvas, or the spreadsheet grid.
3. **Never walk the filesystem at launch.** The tree renders from the SQLite
   manifest, then reconciles in the background.
4. **No feature reaches into another feature's internals.** Cross-module access
   goes through a registry or through `core/`.
5. **Nothing heavy on the main thread.** Parsing, hashing, indexing and slide
   rendering run in Workers.

## Settled decisions — do not relitigate

- **Shell:** Tauri 2 for desktop and mobile. Not Electron, not Capacitor.
- **Build:** Vite + React 19 + TypeScript. Migrated off Next.js (2026-09-28).
- **Storage:** the user's chosen folder. Folder identity == vault identity.
  One vault open at a time; keep a recent-vaults list.
- **App data:** `_mentis/` inside the chosen folder, containing `_journals`,
  `_thoughts`, `_tasks`, `_bookmarks`, `_chats`, `_calendar`, `_drawings`,
  `signatures`, `snapshots`, `templates`, `config.json`, `search-index.json`.
  (Renamed from `_marrow/`; `_dailies` is now `_journals`, `_board` is now
  `_thoughts`. No migration — there were no users of the old layout.)
- **Notebooks:** every root folder is a notebook; every subfolder is a section;
  sections nest. Root folders starting with `_` are system, not notebooks.
  Loose root-level files appear as an implicit "Unfiled" notebook.
- **`_config.md`:** YAML frontmatter. Inherits down the tree, nearest wins.
- **Index:** SQLite + FTS5. Shared table set for search, manifest, sync change
  detection and reminders.
- **AI:** LiteRT-LM with Gemma 4 on device; bring-your-own cloud keys; Ollama
  over LAN. Read-and-answer only for v1 — no agentic writes.
- **Capture grammar:** `/` for destinations, `@` reserved for file references.
  Destinations: Thoughts (default), Journal, Calendar, Tasks, Lists,
  Bookmarks, Note, Chat.
- **Capture behaviour:** bare text and voice commit instantly to Thoughts with
  undo. `/` destinations show a prefilled confirmation modal first.
- **Date parsing:** chrono-node. Deterministic, never AI. Do not attempt to
  parse locations.
- **File extensions:** `.md`, `.canvas`, `.map.md`, `.kan.md`, `.slides.md`
  (Marp dialect). Compound suffixes must be matched before the last segment.
- **Office:** view only. Convert docx to markdown (mammoth → turndown) and
  pptx to `.slides.md`. No xlsx editing in v1.
- **Licence:** BSL 1.1. No third-party plugin system — "modular" means
  internal decoupling only, single tier.
- **Not for clinical or patient data.** Do not add features that imply it is.

## Registries

All of these live in `core/registries/`. Built-in features register through
them exactly as any other module would.

- File types — `{ match(path), icon, viewer, editor, createNew, convertTo }`
- Views — replaces the `ViewMode` enum and the `view-router` switch
- Commands — feeds command palette, editor slash menu, and capture menu
- Capture destinations — `{ sigil, parse(input), confirmFields, write() }`
- Settings schemas — each module contributes; the dialog renders them
- Sync providers, AI providers — largely exist already

Import boundaries are enforced by ESLint `no-restricted-imports`:
`modules/*` may import from `core/*` but never from another `modules/*`.

## Performance budgets — enforced in CI

| Initial JS (gzipped) | ≤ 200 KB |
| Desktop cold start | < 1.0 s |
| Mobile cold start | < 1.8 s |
| Open an existing note | < 100 ms |
| First search results | < 50 ms |
| Binary excluding model | < 15 MB |
| First-PDF lazy chunk | < 400 KB |

A build exceeding these fails. Do not raise a budget to make a build pass —
raise it only as a deliberate, separately committed decision.

## Working agreement

- Produce a plan and wait for approval before editing more than two files.
- One task per branch. Commit at every green build.
- `typecheck`, `lint` and `build` must all pass before a task is considered
  done. Run them; do not assume.
- Do not add a dependency without asking. State the bundle cost when you do.
- Do not refactor, reformat or "improve" code outside the stated task.
- Do not rewrite working features. Existing notes, PDF, canvas, mindmap,
  kanban, tasks, calendar, bookmarks, search and graph all work — the current
  work is migration and decoupling, not reconstruction.
- If a task turns out to be larger than described, stop and say so rather than
  proceeding.
- When behaviour is ambiguous, ask. Do not infer a product decision.
