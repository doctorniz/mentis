# Mentis

_An app by Marrow Group._

A local-first personal knowledge system: notes, PDFs, drawings, tasks, a
calendar and a journal, as ordinary files in a folder you choose. No database
of record, no account, no cloud dependency. On the web, on Windows, and on
Android.

## What it does

- **Notes** — WYSIWYG Markdown (Tiptap) with a source mode, wiki-links and
  backlinks, slash commands, tables, KaTeX, templates, image embeds.
- **PDFs** — annotate, highlight, draw, sign, comment, fill forms; reorder,
  insert, merge and extract pages. Edits are written into the PDF itself, with
  a snapshot taken before the first edit.
- **Drawing canvas** — layered raster drawing (PixiJS/WebGL): pressure and
  tilt-sensitive brushes, eraser, fill, eyedropper, selection, blend modes,
  PNG/PDF export.
- **More file types** — mindmaps (`.map.md`), kanban boards (`.kan.md`), Marp
  slides (`.slides.md`), lists (`.list.md`); view Word, PowerPoint and
  spreadsheets, and convert Word to Markdown and PowerPoint to slides; edit
  code and plain text.
- **Capture** — type anything and it lands in Thoughts; `/task`, `/cal`,
  `/journal`, `/bookmark` … send it elsewhere, with natural-language dates.
  From the desktop, a global hotkey; from the phone, share sheet, shortcuts,
  a widget and a Quick Settings tile.
- **Organizer** — tasks and projects, lists, a calendar with repeating events,
  reminders (desktop and phone notifications with Snooze and Done), and a
  daily journal with tabs from a template.
- **Search and graph** — full-text search across every file type, and a
  wiki-link graph, both from an on-disk index rebuilt from your files.
- **AI chat** — ask about the open document or the whole vault, with cited
  sources. Your own keys (Anthropic, OpenAI, OpenRouter, Gemini), Ollama on
  your network, or Gemma on the device. Read-only: it never edits your files.
- **Sync (optional)** — Dropbox, with change detection; a conflict keeps both
  versions.

## Platforms

| Platform    | Where your files live                                          | Build                                    |
| ----------- | -------------------------------------------------------------- | ---------------------------------------- |
| **Web**     | The browser's private storage, or a folder you pick (Chromium) | `pnpm build` → static `out/`             |
| **Windows** | Any folder on disk                                             | `pnpm tauri:build`                       |
| **Android** | A folder you pick (e.g. in Documents)                          | see [`docs/ANDROID.md`](docs/ANDROID.md) |

## Getting started

Prerequisites: Node.js 22, [pnpm](https://pnpm.io/) (CI uses 9.15), and for
the apps the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
(Rust; for Android the SDK, NDK 27 and a JDK).

```bash
pnpm install
pnpm dev            # the web app, with hot reload
pnpm tauri:dev      # the desktop app
pnpm typecheck && pnpm lint && pnpm test:run
pnpm build && pnpm budgets
CI=1 pnpm exec playwright test   # end-to-end, against the production build
```

Optional Dropbox sync: set `NEXT_PUBLIC_DROPBOX_CLIENT_ID` in `.env.local`
and connect under Settings › Sync — see [`docs/CLOUD_SYNC.md`](docs/CLOUD_SYNC.md).

## Documentation

| Document                                     | What it covers                                                  |
| -------------------------------------------- | --------------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                       | Principles, settled decisions, budgets, working agreement       |
| [Architecture](docs/ARCHITECTURE.md)         | How the code is put together: shells, registries, index, files  |
| [Product](docs/PRD.md)                       | What Mentis is for, what it does, what it deliberately does not |
| [Tech stack](docs/TECH_STACK.md)             | Libraries and why                                               |
| [Conventions](docs/CONVENTIONS.md)           | Code style, naming, Git                                         |
| [Android](docs/ANDROID.md)                   | The phone app: vaults, reminders, touch, pen, releasing         |
| [PDF workflow](docs/PDF_WORKFLOW.md)         | How PDF editing behaves                                         |
| [Cloud sync](docs/CLOUD_SYNC.md)             | Dropbox setup and behaviour                                     |
| [Deployment](docs/DEPLOYMENT.md)             | Hosting the web build                                           |
| [Launch deferrals](docs/LAUNCH_DEFERRALS.md) | Open issues and the manual verification queue                   |
| [Risks](docs/RISKS.md)                       | Risks and mitigations                                           |
| [Archive](docs/archive/README.md)            | Historical plans and reports                                    |

## Roadmap

Done: the web app; the Windows desktop app (tray, capture hotkey, reminders);
the Android app (picked-folder vaults, touch UI, share and quick capture,
reminders, pen). Next:

- **Release** the Android app on Google Play (the pipeline is in place).
- **iOS** — the code is kept iOS-ready; it needs a Mac to build.
- **Per-folder settings** — `_config.md`, inherited down the tree.
- **On-device AI** on LiteRT-LM; **OCR** for scanned PDFs.
- **Marrow Sync** — an optional end-to-end encrypted sync service.

Deliberately out: a third-party plugin system, agentic AI that edits files,
and anything clinical or patient-related.

## AI assistance

Mentis is developed with AI-assisted tooling. Maintainers at Marrow Group
review and integrate changes, but generated material can contain mistakes: you
are responsible for validating behaviour, security, privacy and licensing for
your use.

## License

[Business Source License 1.1](./LICENSE). Licensor: **Marrow Group**; Licensed
Work: **Mentis**. The Additional Use Grant permits production use; on the
Change Date (**2030-04-09**) that version becomes available under **MPL 2.0**.
BSL is not an OSI open-source licence before the Change Date — read `LICENSE`.
Third-party packages keep their own licences.
