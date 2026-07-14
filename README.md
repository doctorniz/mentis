# Mentis

_An app by Marrow Group._

Local-first markdown notes, PDF editor, and unlimited canvas.

## What is Mentis?

Mentis is a local-first personal knowledge base built on a **plain-file architecture**. Every document is a file in a folder you own — markdown notes, PDFs, drawings, spreadsheets — with no database and no lock-in. It runs entirely in the browser, works offline, and optionally syncs via Dropbox.

## Features

- **Markdown Notes** — WYSIWYG editing (Tiptap) with Source mode, wiki-links, backlinks, slash commands, tables, KaTeX math, find/replace, outline, templates, image embed/resize
- **PDF Editor** — Annotate, highlight, draw, sign, comment; page reorder/merge/extract; form filling; find-in-document; edits written destructively into the file with pre-edit snapshots
- **Drawing Canvas** — Layered raster drawing (PixiJS/WebGL): pressure-sensitive brushes, eraser, fill, eyedropper, rectangular selection with move/nudge/clipboard, selection-constrained painting, blend modes, PNG/PDF export
- **Office & code files** — Edit `.docx`, `.pptx`, `.xlsx`/`.csv`, and source/plain-text files inline; mindmaps (`.mind`) and markdown-based kanban boards
- **Organizer** — Tasks (CalDAV-shaped, natural-language quick-add, recurrence, `.ics` export), calendar (day/week/month), quick-capture Board (text/image/voice with Whisper transcription), web bookmarks
- **AI Chat** — Bring-your-own-LLM chat grounded in the open document or the whole vault (MiniSearch RAG, cited sources); OpenRouter / OpenAI / Anthropic / Gemini / Ollama, or fully local Gemma over WebGPU
- **Full-Text Search** — Instant fuzzy search across every file type's content, with tags, folder, date, and type filters
- **Graph** — Force-directed wiki-link graph across all file types
- **Sync (optional)** — Dropbox with SHA-256 change detection, exclude patterns, and conflict notifications
- **Offline-First PWA** — Installable, Service Worker caching, mobile layout with touch drawing

## Architecture

```
src/
├── app/              # Next.js App Router shell (layout, page, Dropbox OAuth return)
├── components/       # React UI by domain: shell, views, notes, pdf, canvas, board,
│                     # tasks, calendar, bookmarks, kanban, mindmap, pptx, chat,
│                     # file-browser, graph, audio, ui
├── contexts/         # VaultFsContext, NotesWorkspaceContext, SyncContext
├── hooks/            # use-auto-save
├── lib/              # Framework-free logic: fs, vault, editor, markdown, notes, pdf,
│                     # canvas, search, sync, chat, board, tasks, calendar, bookmarks,
│                     # kanban, mindmap, spreadsheet, code, audio, graph, snapshot, browser
├── stores/           # Zustand+Immer stores, one per domain
├── types/            # TypeScript type definitions
└── utils/            # cn.ts (clsx + tailwind-merge)
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture.

## Tech Stack

| Layer       | Technology                                                                        |
| ----------- | --------------------------------------------------------------------------------- |
| Framework   | Next.js 15 (App Router, static export)                                            |
| UI          | React 19, Tailwind CSS 4, Radix UI, Lucide icons                                  |
| Notes       | Tiptap (ProseMirror) + marked + turndown + gray-matter; CodeMirror 6 (source/code) |
| PDF         | PDF.js (render), pdf-lib (write), Fabric.js (annotation overlay)                  |
| Canvas      | PixiJS v8 (WebGL, layered raster)                                                 |
| Office      | @eigenpal/docx-js-editor, slidecanvas (PPTX), SheetJS + jspreadsheet-ce           |
| AI          | Provider SSE clients; MediaPipe LLM (local Gemma); transformers.js (Whisper)      |
| Search      | MiniSearch                                                                        |
| State       | Zustand + Immer                                                                   |
| File System | OPFS (all browsers); File System Access API on Chromium (“open folder”)           |
| Offline     | Service Worker (stale-while-revalidate), PWA manifest                             |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+

### Setup

Optional **Dropbox sync** — set `NEXT_PUBLIC_DROPBOX_CLIENT_ID` in `.env.local`; connect under **Settings → Sync**; when enabled, the Vault toolbar shows a **sync** button next to Preview / Files. See [`docs/CLOUD_SYNC.md`](docs/CLOUD_SYNC.md).

```bash
# Install dependencies
pnpm install

# Start development server (Turbopack)
pnpm dev

# If you see Turbopack "Next.js package not found", reinstall deps or use Webpack:
pnpm dev:webpack

# Type check
pnpm typecheck

# Lint
pnpm lint

# Run tests
pnpm test
```

### Build

```bash
pnpm build
```

The app builds as a static export (SPA) suitable for deployment to any static hosting.

## Documentation

Detailed documentation lives in the `docs/` folder:

| Document                                         | Description                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [PRD](docs/PRD.md)                               | Product requirements and feature breakdown                                                  |
| [Architecture](docs/ARCHITECTURE.md)             | System architecture, data flows, module design                                              |
| [Tech Stack](docs/TECH_STACK.md)                 | Technology choices and rationale                                                            |
| [Development Phases](docs/DEVELOPMENT_PHASES.md) | Week-by-week delivery plan                                                                  |
| [Conventions](docs/CONVENTIONS.md)               | Code style, naming, project structure                                                       |
| [Cursor / AI](docs/CURSOR.md)                    | Cursor rules and AI workflow for this repo                                                  |
| [PDF Workflow](docs/PDF_WORKFLOW.md)             | Detailed PDF editing UX specification                                                       |
| [Risks](docs/RISKS.md)                           | Risk register with mitigations                                                              |
| [Deployment](docs/DEPLOYMENT.md)                 | Static export, COOP/COEP headers on hosting                                                 |
| [Cloud sync](docs/CLOUD_SYNC.md)                 | Dropbox env var, OAuth, redirect URI                                                        |
| [License](LICENSE)                               | Business Source License 1.1 (full text); summaries in Architecture §10, PRD §6, Conventions |

## Development Phases

1. **Phase 1 (Weeks 1–12):** Web MVP — markdown editor, PDF browser/editor, unlimited canvas, wiki graph view, Vault (tree + browse) / Search / Graph shell + New popover, offline PWA ✅
2. **Phase 2 (Weeks 13–18):** Desktop app (Tauri), extended template features, Marrow Sync
3. **Phase 3 (Weeks 19–26):** Mobile (Capacitor), stylus support, OCR, plugin system, public launch

## AI assistance

This project was developed with **AI-assisted** tooling (e.g. IDE-integrated agents and language models). Human maintainers at Marrow Group review and integrate changes; generated material can still contain mistakes. **You are responsible** for validating behaviour, security, privacy, and licensing for your use case. See [`docs/CURSOR.md`](docs/CURSOR.md) for workflow expectations.

## License

Licensed under the **Business Source License 1.1** — see [`LICENSE`](./LICENSE). Short summary: **Marrow Group** / **Mentis**; production use is permitted under the **Additional Use Grant** in `LICENSE`; **Change Date** **2030-04-09**, then **MPL 2.0** for that version as stated in `LICENSE`. BSL is not the same as OSI “open source” before the Change Date — read the full file. Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §10, [`docs/PRD.md`](docs/PRD.md) §6.
