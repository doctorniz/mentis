# Mentis — project context

Local-first personal knowledge system. Every item of user data is an ordinary
file in a folder the user chooses. No database of record, no account required,
no cloud dependency.

One codebase (~61k LOC TS/TSX, ~5k Rust): a Vite + React 19 web app (files in
OPFS, or a folder via the File System Access API), the same app in a Tauri 2
desktop shell (Windows) with real filesystem access, and in a Tauri 2 Android
app (a folder picked through the Storage Access Framework), and in a Tauri 2
iOS app (iPhone and iPad; the app's folder or one picked in Files, built on a
Mac). See `docs/ARCHITECTURE.md`, `docs/ANDROID.md` and `docs/IOS.md`.

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
- **App data:** `_mentis/` inside the chosen folder, containing
  `_bookmarks`, `_chats`, `_calendar`, `_drawings`, `signatures`,
  `snapshots`, `templates`, `config.json`, `search-index.json`.
- **Tasks are checkbox lines in notes:** a line like
  `- [ ] text >date HH:mm !2 #tag every monday`. Ticking writes
  `done:YYYY-MM-DD`, a snooze writes `snooze:…`, and indented checkboxes are
  subtasks. New tasks go to `Inbox.md` (a setting). The index's `tasks`
  table is derived. (Replaced `_mentis/_tasks` on 2026-10-29. No migration.)
- **User content is visible:** Thoughts, the journal and attachments are
  ordinary folders at the root — `Thoughts/`, `Journal/`, `Attachments/` —
  each changeable in Settings. Nothing the user wrote is hidden in
  `_mentis/`. (Moved out of `_mentis/_thoughts`, `_mentis/_journals` and
  `_assets` on 2026-10-24. No migration — there were no users.)
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

A build exceeding a size budget (initial JS, binary, first-PDF chunk) fails;
the timings are measured in CI and reported (`perf-budgets.json`). Do not
raise a budget to make a build pass —
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
- Keep `docs/` in step with the code: a change to behaviour, structure,
  dependencies or process updates the doc that describes it in the same task
  (`README.md`, `docs/ARCHITECTURE.md`, `docs/TECH_STACK.md`, …). Behaviour a
  person must check by hand goes in the manual verification queue in
  `docs/LAUNCH_DEFERRALS.md`.
- UI copy: say as little as possible. A label and its control; a hint under a
  setting only when it prevents a real mistake.
