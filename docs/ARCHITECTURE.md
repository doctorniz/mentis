# Mentis — Architecture

How the code is put together today. The principles it serves and the settled
decisions behind it are in [`CLAUDE.md`](../CLAUDE.md); the phone apps'
specifics are in [`ANDROID.md`](./ANDROID.md) and [`IOS.md`](./IOS.md).

_Last reviewed 2026-10-13._

---

## 1. One app, four shells

The same React front end runs in three places. A build mode decides which
platform pieces are included; everything else is shared.

| Shell       | Build                                   | Files                                                                                | Index                        |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| **Web**     | `vite build` → static `out/`            | OPFS, or a picked folder (File System Access API)                                    | sqlite-wasm in a Web Worker  |
| **Desktop** | `tauri build` (`--mode desktop`)        | A folder on disk, through Rust (`vault_fs.rs`)                                       | rusqlite in the Rust process |
| **Android** | `tauri android build` (`--mode mobile`) | A folder picked through Android's Storage Access Framework (`saf.rs`, `SafStore.kt`) | rusqlite in the Rust process |
| **iOS**     | `tauri ios build` (`--mode mobile`)     | The app's folder, or one picked in Files (`plugins/folders`)                         | rusqlite in the Rust process |

- `__MENTIS_DESKTOP__` is true in both app builds (the native index; no
  sqlite-wasm). `__MENTIS_MOBILE__` is true on the phone (no tray, capture
  hotkey, overlay or launch at login).
- `isTauri()` (`src/lib/fs/platform.ts`) answers "inside a shell?";
  `isDesktopApp()` answers "the desktop app?".
- Phone code is `cfg(mobile)` where it is not specific to one platform.

---

## 2. Source layout

```
src/
├── main.tsx, capture-main.tsx, auth-dropbox-main.tsx   HTML entries (app, desktop capture overlay, Dropbox return)
├── core/            Shared machinery no feature owns
│   ├── registries/  file types, views, commands, capture destinations, settings
│   ├── index/       the search/manifest index: protocol, store, workers, reconcile
│   ├── capture/     the capture grammar: CaptureText, chrono-node date parsing
│   ├── convert/     convert a file to another type (docx → md, pptx → slides)
│   └── render/      slide rendering in a worker
├── modules/         One folder per feature; each registers itself (§3)
├── components/      React UI, by domain (shell, views, notes, pdf, canvas, …)
├── lib/             Framework-free logic, by domain (fs, vault, search, sync, reminders, …)
├── stores/          Zustand + Immer stores, one per domain
├── contexts/        Vault session, notes workspace, sync
└── types/           Shared types
src-tauri/           The Rust shell (desktop and Android) and the Android project (gen/android)
```

**Boundaries** (enforced by ESLint `no-restricted-imports`): a module never
imports another module — cross-feature access goes through `core/` or a
registry — and `core/` imports neither `modules/` nor `components/`.

---

## 3. Registries

Built-in features register exactly as any other module would. Discovery is by
glob over `src/modules/*/`, so adding a module never edits a central list.

| Registry                 | A module contributes                                                                              | Used by                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **File types**           | `{ id, suffixes, editor (lazy), layout, appearance, search, createNew, convertTo, thumbnail, … }` | tree, tabs, New menu, graph, search, convert |
| **Views**                | `{ id, label, icon, component (lazy), nav, shortcut, palette, aliases }`                          | sidebar, tab bar, view router, shortcuts     |
| **Commands**             | `{ id, title, scope, run }`                                                                       | command palette (Ctrl+K), editor slash menu  |
| **Capture destinations** | `{ sigil, parse, fields, validate, enrich, write }`                                               | capture bar, confirm dialog, overlay, shares |
| **Settings**             | sections of fields (`get`/`set` on the vault config) or a lazy panel                              | the settings dialog                          |

File types are matched by suffix, longest first, so compound extensions work:
`.md`, `.canvas`, `.map.md`, `.kan.md`, `.slides.md`, `.list.md`. Editors and
views are `React.lazy` — opening a note never loads the PDF engine, the
canvas or the spreadsheet grid. A type can also claim another type's files
on their contents (`claims`): a markdown note whose frontmatter says
`type: list` opens in the list editor, and the index records it as a `list`.

**Layout.** On a wide screen one sidebar holds everything: Search and New, a
date card that opens today's journal (Ctrl+1), the views with `nav` — Chat,
Calendar, Tasks, Thoughts, Bookmarks (Ctrl+2 to 6) — and below them the
vault's file tree (`sidebar-files.tsx`, loaded after the shell). Opening a
file from the tree or search shows it in the vault view, the editor with its
tabs, from whichever view is up. The vault view, Files and Graph have no
sidebar entry: the tree opens files, the palette reaches every view, and Graph
is on the tree's heading. On a phone the sidebar is replaced by the masthead
menu and the bottom tab bar — Capture between four tabs chosen in Settings ›
Phone — and the tree is its own full-screen view (`tree`, the Notes tab,
`palette: false`). Both load only on a narrow screen.

---

## 4. Files

Every piece of user data is a file in the vault folder. Feature code sees
vault-relative paths through `FileSystemAdapter` (`src/lib/fs/types.ts`):

```
OpfsAdapter ─┐
FsapiAdapter ┼─→ ScopedAdapter (vault root) ─→ vaultFs ─→ features
TauriAdapter ┘   (the shell's vault_* commands: a folder path, or a content:// tree on Android)
```

The Rust `vault_*` commands resolve every path inside a root the user chose
(no `..`, no symlinks out). On Android a root is a picked SAF tree; reads and
writes hand Rust a file descriptor (§9).

**Vault layout:** user notes and folders at the top level (root folders are
notebooks; `_`-prefixed ones are system), and app data under `_mentis/`:
`_calendar`, `_bookmarks`, `_chats`, `_drawings`, `signatures`,
`snapshots`, `templates`, `config.json`. Thoughts, journal entries and
attachments are ordinary visible folders, each set in Settings: `Thoughts/`
(one note per thought, named by time and first words; every note in the
folder is a thought), `Journal/` (`YYYY-MM-DD.md`) and `Attachments/`
(pasted images, recordings, Thoughts' images too). Being outside
`_mentis/`, they appear in the tree, search and graph.

**Markdown notes** load into the editor through marked and save through
turndown (`src/lib/editor/markdown-bridge.ts`). Opening and saving a note
without edits leaves it byte-for-byte the same for what the editor writes
(`tests/markdown-fidelity.test.ts`). The editor has no node for raw HTML, so
comments and tags (other than `<u>`) are kept as visible text rather than
dropped; footnotes and callouts are kept as written. A loose list whose items
are single paragraphs comes back tight.

What is _not_ in files is derived or per-device: the index (§5), per-device
preferences in `localStorage` (theme, panel widths, "Draw with"), OAuth tokens
and API keys in IndexedDB or the OS, the desktop's `app-settings.json`.

---

## 5. The index

One SQLite database per vault holds everything derived from the files:
deleting it loses nothing, and it is rebuilt from them.

| Table       | Holds                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `files`     | the manifest: path, type, size, mtime, title, tags                    |
| `fts`       | full-text search (FTS5) over title, content, tags                     |
| `chunks`    | ~1,500-character passages (FTS5) for AI chat retrieval                |
| `links`     | wiki-link targets as written, for backlinks and the graph             |
| `tree`      | each folder's last listing, so the tree draws before the disk is read |
| `hashes`    | SHA-256 per file at size+mtime, so sync re-hashes only what changed   |
| `reminders` | reminder occurrences from tasks, events and the journal prompt        |
| `tasks`     | every checkbox line in the notes, parsed (`src/lib/tasks/line.ts`)    |

- **Web:** sqlite-wasm in a Web Worker, persisted in the OPFS SAH pool
  (`src/core/index/worker.ts`). **Shells:** rusqlite in Rust
  (`src-tauri/src/index/`), reached through one `index_call` command. The two
  stores implement the same protocol (`src/core/index/protocol.ts`) and share
  `INDEX_VERSION` — a different version rebuilds the index.
- **Extraction** runs in a worker: each module's `search.ts` turns a file into
  `{ title, content, tags, links, tasks }` (`src/core/index/extract-worker.ts`).
- **PDF edits** (pdf-lib: saving annotations, page operations, forms) run in
  a worker too (`src/lib/pdf/pdf-ops.ts`), started on the first edit.
- **Launch:** the tree and search answer from the index at once; a background
  reconcile then lists the vault (metadata only) and re-extracts only new or
  changed files. On the desktop a watcher (`watch.rs`) reports changes; on
  Android the vault is reconciled whenever the app returns to the front.

---

## 6. Launch path

`index.html` → restore the last vault (`src/lib/vault/session.ts`) → the shell
(`app-shell.tsx`) renders from the index → background reconcile → lazy views.
Things that are not needed at once load after the shell is up: reminders,
the command palette, settings, and on the phone the share inbox and touch
handling. `markShellReady()` reports the moment (desktop cold-start
measurement; Android's "Fully drawn" log).

---

## 7. Capture, Calendar and Tasks

**Capture.** Bare text goes to Thoughts at once, with Undo. `/` picks a
destination (Journal, Calendar, Task, List, Bookmark, Note, Chat), each shown
for confirmation first; `@` is reserved for file references. Dates are read by
chrono-node (loaded lazily, English only), never by AI. Capture is reachable
from the capture bar, the command palette, the desktop's global hotkey and
overlay window, and on the phone from shares, app shortcuts, a widget and a
Quick Settings tile.

**Tasks** are checkbox lines in any note:
`- [ ] Call the bank >2026-10-30 09:00 !2 #money every friday`. `>date` is
the due day and a time on it the reminder; `!1`–`!4` the priority; `every
<weekday>` a weekly repeat; indented checkboxes are subtasks. Ticking writes
`done:YYYY-MM-DD` (in the Tasks view or the editor, `task-done-extension.ts`);
ticking a weekly task adds the next one above it. A reminder's Snooze writes
`snooze:…`, its Done ticks the task. The markdown extractor parses the lines
into the index's `tasks` table, which the Tasks view, the calendar and
reminders read; edits rewrite the one line in its note (found again by its
text if lines above it moved) and reindex that note. New tasks are added to
`Inbox.md` (Settings › Vault). Kanban, slides, mindmap and list files are not
read for tasks.

**Lists** are `.list.md` files, or notes marked `type: list` (the note
editor's "Make this a list"; the list editor's "Turn into a note" takes it
off). Tasks › Lists and `/list` find them in the index by type
(`pathsOfType`). New lists go to `Lists/` (Settings › Vault).

**Calendar and Tasks.** Tasks, grouped By date (Overdue, Today, Next 7 days,
Later, No date) or By note, with Lists (checklists, ordered lists, scheduled
reset) as a second tab; the Calendar
(repeating events, alerts, tasks on their due days, a mark on days with a
journal entry) with Reminders as a second tab; and the Journal (a note per day,
with tabs from a template).

**Reminders.** Occurrences are worked out from the files
(`src/lib/reminders/`), recorded in the index, and delivered by the platform:

| Shell   | Delivery                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Web     | the app's own timer; the Notification API when allowed; in-app cards                                                                |
| Desktop | a Rust thread (`reminders.rs`) that sleeps until each one — a hidden window's timers are throttled                                  |
| Android | exact alarms in Kotlin (`Reminders.kt`); Snooze and Done work without opening the app and are written to the file when it next runs |

Done and Snooze are written into the item's file (`reminderAck`,
`snoozeUntil`); reminders missed while the app was closed are offered once.

---

## 8. Sync and AI

**Sync** (`src/lib/sync/`): Dropbox, last-write-wins with the other side
kept as a conflict copy, a manifest and hash cache so only changed files are hashed,
excludes (`_mentis/snapshots`, `_mentis/trash`, `sync.excludePaths`). Deletes go
to a dated trash folder on each side, and a run that would delete many files asks first. Sign-in returns to
`/auth/dropbox` on the web and to a one-shot listener on `127.0.0.1` in the
desktop and Android apps (RFC 8252). See [`CLOUD_SYNC.md`](./CLOUD_SYNC.md).

**AI chat** is read-and-answer only (no writes). Providers: bring-your-own
keys (Anthropic, OpenAI, OpenRouter, Gemini), Ollama on the LAN, or Gemma on
the device (MediaPipe over WebGPU today; LiteRT-LM is the settled direction).
Vault chat ranks passages from the `chunks` table; document chat reads the
open file through its extractor. Voice notes are transcribed by Whisper
(transformers.js).

---

## 9. The shells (Rust)

`src-tauri/src/`:

| Module                          | Does                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `vault_fs.rs`, `vaults.rs`      | file access inside the open vault; the folder picker; the recent-vaults list     |
| `saf.rs`                        | Android picked folders: the Kotlin `SafStore` over JNI                           |
| `index/`                        | the native SQLite index                                                          |
| `watch.rs`                      | the desktop file watcher                                                         |
| `reminders.rs`                  | reminder delivery (desktop thread; Android hands off to Kotlin)                  |
| `overlay.rs`, `app_settings.rs` | desktop: tray, capture hotkey and overlay window, launch at login, close to tray |
| `oauth.rs`                      | the loopback sign-in listener                                                    |
| `startup.rs`                    | shell-ready signal, cold-start measurement, Android activity hooks               |

Android's Kotlin lives in `src-tauri/gen/android/app/src/main/java/app/mentis/`
(`SafPlugin`, `SafStore`, `ShellPlugin`, `Reminders`, `Inbox`, `QuickCapture`).

---

## 10. Performance budgets and CI

Budgets are in `perf-budgets.json`; a build that exceeds an enforced one
fails, and a budget is raised only as a deliberate, separate commit.

| Budget                     | Limit    | Checked by                                     |
| -------------------------- | -------- | ---------------------------------------------- |
| Initial JS (gzipped)       | ≤ 200 KB | `pnpm budgets` (enforced)                      |
| Initial JS + CSS (ratchet) | ≤ 209 KB | `pnpm budgets` (enforced; lowered as it falls) |
| Desktop binary             | < 15 MB  | `pnpm budgets:binary` (enforced)               |
| First-PDF lazy chunk       | < 400 KB | `pnpm budgets` (report only)                   |
| Desktop cold start         | < 1.0 s  | `pnpm budgets:cold-start` (report only)        |
| Mobile cold start          | < 1.8 s  | by hand on a device (`docs/ANDROID.md`)        |

CI (`.github/workflows/ci.yml`) on every push to `main` and every pull
request: typecheck, lint, unit tests, build and budgets; the full Playwright
suite on the production build (desktop Chromium and a Pixel 5 profile); the
Windows desktop build with Rust format, clippy and tests; an Android build;
and an iOS simulator build, launched with a screenshot kept. Signed Android releases come from a version tag
(`android-release.yml`, see `docs/ANDROID.md`).

---

## 11. Known gaps

- **Android saves** to a picked folder overwrite in place; desktop and
  browser saves go through a temporary file.
- **`_config.md` inheritance** (per-folder settings, nearest wins) is decided
  but not built.
- The desktop cold-start and capture-overlay timings are reported, not yet
  enforced; the Android cold start was measured only on an emulator.
- **iOS** has vaults only: no reminders, shares, widget, Dropbox sign-in or
  on-device AI yet, and offloaded iCloud Drive files do not open.
- More, with IDs, in [`LAUNCH_DEFERRALS.md`](./LAUNCH_DEFERRALS.md).
