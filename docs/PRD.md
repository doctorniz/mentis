# Mentis — Product

_An app by Marrow Group. Last reviewed 2026-10-13._

What Mentis is for, what it does today, and what it deliberately does not do.
How it is built is in [`ARCHITECTURE.md`](./ARCHITECTURE.md); the principles
and settled decisions are in [`CLAUDE.md`](../CLAUDE.md).

---

## 1. What it is

A local-first personal knowledge system. Everything you write, draw, annotate,
plan or capture is an ordinary file in a folder you choose — readable in any
other tool, yours to copy, sync or walk away with. There is no account, no
database of record and no cloud dependency.

It is one app on the web, Windows and Android, built to be quick to capture
into and fast to open.

## 2. Principles, for users

| Principle                  | What it means in practice                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Files are the truth**    | Notes are `.md`, drawings are `.canvas` + PNGs, tasks and events are Markdown with frontmatter. Anything derived (the search index) can be deleted and rebuilt. |
| **Your folder**            | The vault is a folder you pick; one vault open at a time, with a recent list.                                                                                   |
| **One file per PDF**       | PDF annotations, highlights and signatures are written into the PDF itself — no sidecars.                                                                       |
| **Quick to capture**       | Type, and it is saved. Natural-language dates; no forms unless you ask for a destination.                                                                       |
| **Fast**                   | The app opens to your vault at once and loads each tool only when you use it (budgets in `CLAUDE.md`).                                                          |
| **AI answers, never acts** | Chat reads your files to answer, with sources; it does not edit or create them.                                                                                 |

## 3. What it does

### Writing and documents

- **Notes** — WYSIWYG Markdown with a source mode; wiki-links and backlinks;
  slash commands; tables, task lists, KaTeX, callouts; templates with
  variables; image embeds; PDF page embeds (`![[file.pdf#page=3]]`).
- **PDFs** — view, search, highlight, draw, add text boxes and comments, sign,
  fill forms; add, delete, reorder, rotate, merge and extract pages; a snapshot
  before the first edit, version history, auto-save. Detail:
  [`PDF_WORKFLOW.md`](./PDF_WORKFLOW.md).
- **Drawing canvas** — layers with opacity, blend modes and locking; pressure
  and tilt-sensitive brushes; eraser, fill, eyedropper, selection; undo; export.
- **Mindmaps, kanban boards, slides, lists** — each a Markdown file with its own
  editor. **Office files** open for viewing; Word converts to a note and
  PowerPoint to slides. **Code and text** files edit in place.

### Capture and organising

- **Capture** — a bar everywhere: bare text goes to Thoughts with Undo; `/task`,
  `/cal`, `/journal`, `/list`, `/bookmark`, `/note`, `/chat` send it elsewhere
  after a prefilled confirmation. Also from the desktop's global hotkey, and
  from the phone's share sheet, app shortcuts, widget and Quick Settings tile.
- **Tasks** — projects, priorities, due dates, weekly repeats, reminders.
- **Lists** — checklists and ordered lists, with notes and a scheduled reset.
- **Calendar** — day, week and month; repeating events; alerts.
- **Reminders** — for tasks, events and an evening journal prompt; delivered
  as notifications on desktop and phone (Snooze and Done right there) and in
  the app; a tab of missed and upcoming ones.
- **Journal** — a page per day, with tabs from a template.
- **Bookmarks** — links with previews, in collections.

### Finding and connecting

- **Search** across every file type's content, with tag, folder, date and type
  filters. **Graph** of wiki-links. **Command palette** (Ctrl+K) for actions
  and files.
- **AI chat** about the open document or the whole vault, with cited sources:
  your own provider keys, Ollama on your network, or Gemma on the device.

### Across devices

- **Dropbox sync** (optional), file by file, with conflict notification.
- **Desktop** (Windows): tray, launch at login, global capture hotkey.
- **Android**: a vault in a folder you pick, touch-first layout, pen support
  with palm rejection.

## 4. Out of scope

- **A third-party plugin system.** "Modular" means internal decoupling only.
- **Agentic AI** that writes or edits files (v1 is read-and-answer).
- **Clinical or patient data.** Mentis is not built or meant for it; features
  that imply it are not added.
- **Editing spreadsheets** (viewing only in v1) and parsing locations from
  captured text.

## 5. Data and privacy

- Local by default; nothing leaves the device unless you turn on sync or use a
  cloud AI provider with your own key.
- Provider keys and sign-in tokens stay on the device (IndexedDB or the OS),
  never in the vault.
- No telemetry.
- Export is copying the folder.

## 6. Open questions

1. **Monetisation** — free core plus paid sync, or another model.
2. **Marrow Sync** — an optional end-to-end encrypted sync service: whether,
   and how it handles conflicts (CRDTs for Markdown, copies for binaries).
3. **On-device AI** — moving from MediaPipe to LiteRT-LM, and which Gemma size
   a phone can carry.

Licence: [`LICENSE`](../LICENSE) (Business Source License 1.1; summary in the
README).
