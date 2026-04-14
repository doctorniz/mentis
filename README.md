# Mentis

*An app by Marrow Group.*

Local-first markdown notes, PDF editor, and unlimited canvas.

## What is Mentis?

Mentis is a cross-platform note-taking application built on a **local-first, markdown-file architecture**. Every note is a `.md` file, every asset lives alongside it, and you always own your data. Mentis is also a **full-featured PDF editor**: annotate, highlight, sign, and manage PDFs as first-class citizens — all edits written directly into the file.

## Features

- **Markdown Notes** — WYSIWYG editing with Tiptap, wiki-links, slash commands, backlinks, frontmatter, tags, templates
- **PDF Editor** — View, annotate, highlight, draw, sign, text boxes, comments, page panel (reorder, merge, extract selection), form filling, auto-save (default 5s, Settings), snapshots, page-op undo/redo
- **Unlimited Canvas** — Infinite whiteboard with freehand drawing, text cards, sticky notes, connectors, frames, wiki-link cards, export to PNG/PDF, auto-save
- **Vault** — One sidebar entry: 🌳 tree (folder tree + editors) and 🗂️ browse (grid/list with thumbnails, import, sort, filter, batch move/delete modals, context menu)
- **Image preview & edit** — Open PNG/JPEG/WebP from the vault tree: rotate, trim edges (crop), brightness/contrast/saturation, save in place
- **Full-Text Search** — Instant search across all notes, PDFs, and canvases with MiniSearch, tag support, filters, snippets
- **Offline-First PWA** — Works entirely in the browser, installable, Service Worker caching
- **Keyboard Shortcuts** — Full shortcut system with help dialog (Ctrl+Shift+?)

## Architecture

```
src/
├── app/              # Next.js App Router (layout, page, globals.css)
├── components/
│   ├── shell/        # AppShell, sidebar, view router, shortcuts dialog
│   ├── views/        # VaultView (tree + browse), SearchView, NewView, …
│   ├── notes/        # Markdown editor, file tree, tabs, toolbar, wiki-links, backlinks
│   ├── pdf/          # PDF viewer, annotations, page panel, forms, signatures
│   ├── canvas/       # Infinite canvas editor + toolbar
│   ├── file-browser/ # Grid/list cards, context menu, batch ops, import
│   ├── search/       # Search index bootstrap
│   └── ui/           # Shared primitives (Button)
├── contexts/         # VaultFsProvider, NotesWorkspaceProvider
├── lib/
│   ├── fs/           # FileSystemAdapter + OPFS + FSAPI (showDirectoryPicker) adapters
│   ├── vault/        # Vault lifecycle (create, discover, config)
│   ├── editor/       # Tiptap extensions, slash/wiki, markdown bridge
│   ├── markdown/     # gray-matter parsing, wiki-link/tag extraction
│   ├── notes/        # Tree filtering, new-note paths, template store, backlinks
│   ├── pdf/          # pdfjs-loader, annotations, page ops, signatures, thumbnails
│   ├── search/       # MiniSearch index, build, query, snippets
│   ├── canvas/       # Canvas JSON serialization
│   ├── file-browser/ # File collection, sort, filter
│   └── snapshot/     # PDF snapshot management
├── stores/           # Zustand stores (vault, ui, editor, pdf, canvas, search, file-tree, file-browser)
├── types/            # TypeScript type definitions
└── utils/            # cn.ts (clsx + tailwind-merge)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, static export) |
| UI | React 19, Tailwind CSS 4, Radix UI, Lucide icons |
| Editor | Tiptap (ProseMirror) + marked + turndown + gray-matter |
| PDF | PDF.js (render), pdf-lib (write), Fabric.js (annotations) |
| Canvas | Fabric.js (infinite surface) |
| Search | MiniSearch |
| State | Zustand + Immer |
| File System | OPFS (all browsers); File System Access API on Chromium (“open folder”) |
| Offline | Service Worker (stale-while-revalidate), PWA manifest |

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

| Document | Description |
|---|---|
| [PRD](docs/PRD.md) | Product requirements and feature breakdown |
| [Architecture](docs/ARCHITECTURE.md) | System architecture, data flows, module design |
| [Tech Stack](docs/TECH_STACK.md) | Technology choices and rationale |
| [Development Phases](docs/DEVELOPMENT_PHASES.md) | Week-by-week delivery plan |
| [Conventions](docs/CONVENTIONS.md) | Code style, naming, project structure |
| [Cursor / AI](docs/CURSOR.md) | Cursor rules and AI workflow for this repo |
| [PDF Workflow](docs/PDF_WORKFLOW.md) | Detailed PDF editing UX specification |
| [Risks](docs/RISKS.md) | Risk register with mitigations |
| [Deployment](docs/DEPLOYMENT.md) | Static export, COOP/COEP headers on hosting |
| [Cloud sync](docs/CLOUD_SYNC.md) | Dropbox env var, OAuth, redirect URI |
| [License](LICENSE) | Business Source License 1.1 (full text); summaries in Architecture §10, PRD §6, Conventions |


## Development Phases

1. **Phase 1 (Weeks 1–12):** Web MVP — markdown editor, PDF browser/editor, unlimited canvas, wiki graph view, Vault (tree + browse) / Search / Graph shell + New popover, offline PWA ✅
2. **Phase 2 (Weeks 13–18):** Desktop app (Tauri), extended template features, Marrow Sync
3. **Phase 3 (Weeks 19–26):** Mobile (Capacitor), stylus support, OCR, plugin system, public launch

## AI assistance

This project was developed with **AI-assisted** tooling (e.g. IDE-integrated agents and language models). Human maintainers at Marrow Group review and integrate changes; generated material can still contain mistakes. **You are responsible** for validating behaviour, security, privacy, and licensing for your use case. See [`docs/CURSOR.md`](docs/CURSOR.md) for workflow expectations.

## License

Licensed under the **Business Source License 1.1** — see [`LICENSE`](./LICENSE). Short summary: **Marrow Group** / **Mentis**; production use is permitted under the **Additional Use Grant** in `LICENSE`; **Change Date** **2030-04-09**, then **MPL 2.0** for that version as stated in `LICENSE`. BSL is not the same as OSI “open source” before the Change Date — read the full file. Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §10, [`docs/PRD.md`](docs/PRD.md) §6.
