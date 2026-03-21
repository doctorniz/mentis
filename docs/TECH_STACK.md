# Ink by Marrow — Tech Stack

## Phase 1: Web App

### Core Framework

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 15.x (App Router) | React framework with SSG/SSR, file-based routing, optimized bundling |
| **React** | 19.x | UI library |
| **TypeScript** | 5.x | Type safety across the entire codebase |

### Markdown Editing

| Technology | Purpose |
|---|---|
| **Tiptap** | ProseMirror-based rich text editor with extension system |
| **@tiptap/starter-kit** | Base editor extensions (bold, italic, lists, etc.) |
| **@tiptap/extension-task-list** | Task list / checkbox support |
| **@tiptap/extension-table** | GFM table support |
| **@tiptap/extension-code-block-lowlight** | Syntax-highlighted code blocks |
| **@tiptap/extension-placeholder** | Placeholder text for empty documents |
| **remark / unified** | Markdown ↔ AST parsing for frontmatter, link resolution, indexing |
| **remark-gfm** | GitHub Flavored Markdown support |
| **remark-frontmatter** | YAML frontmatter parsing |
| **remark-math + rehype-katex** | LaTeX math rendering |

### PDF Engine

| Technology | Purpose |
|---|---|
| **pdfjs-dist** (PDF.js) | PDF rendering, text layer, search, outline extraction |
| **pdf-lib** | Client-side PDF manipulation — annotation writing, page management, merge/split, form filling, signature stamping |
| **Fabric.js** | Canvas overlay for annotation editing on PDF pages; also powers the unlimited canvas |

### Search

| Technology | Purpose |
|---|---|
| **MiniSearch** | Lightweight client-side full-text search with fuzzy matching, prefix search, field boosting |

### State Management

| Technology | Purpose |
|---|---|
| **Zustand** | Minimal, performant state management with devtools support |
| **Immer** (via Zustand middleware) | Immutable state updates with mutable syntax |

### Styling & UI

| Technology | Purpose |
|---|---|
| **Tailwind CSS** | Utility-first CSS framework |
| **tailwind-merge** | Intelligent class merging for component variants |
| **class-variance-authority (CVA)** | Type-safe component variant definitions |
| **Lucide React** | Icon library (consistent, tree-shakeable) |
| **Radix UI** | Unstyled, accessible UI primitives (dialogs, dropdowns, tooltips, etc.) |
| **Framer Motion** | Animations and transitions |

### File System & Offline

| Technology | Purpose |
|---|---|
| **Origin Private File System (OPFS)** | Browser-native performant local storage |
| **File System Access API** | "Open folder" vault access on Chromium browsers |
| **Workbox** | Service Worker tooling for offline caching and PWA |

### Build & Dev Tooling

| Technology | Purpose |
|---|---|
| **pnpm** | Fast, disk-efficient package manager |
| **ESLint** | Linting with flat config |
| **Prettier** | Code formatting |
| **Vitest** | Unit and integration testing |
| **Playwright** | E2E browser testing |
| **Husky + lint-staged** | Pre-commit hooks |

---

## Phase 2: Desktop (Tauri)

| Technology | Purpose |
|---|---|
| **Tauri v2** | Rust-based desktop shell, small binary, native FS access |
| **Tauri FS plugin** | Direct read/write to user's vault directory |
| **Tauri updater** | Auto-update mechanism |
| **Tauri shell plugin** | System integration (open in default app, etc.) |

---

## Phase 3: Mobile

| Technology | Purpose |
|---|---|
| **Capacitor** (or Tauri Mobile) | Mobile shell wrapping the web app |
| **Pointer Events API** | Stylus/Apple Pencil pressure sensitivity |
| **Capacitor Filesystem** | Sandboxed file storage |
| **iCloud / SAF integration** | Native cloud sync per platform |

---

## Key Library Decisions

### Why Tiptap over Milkdown, BlockNote, or raw ProseMirror?

- First-class React bindings with strong TypeScript support
- Mature extension ecosystem covering all our markdown needs
- Active maintenance and commercial backing
- Easier to extend than raw ProseMirror while retaining full ProseMirror power
- Better WYSIWYG experience than Milkdown for our "renders in-place" requirement

### Why Fabric.js over Konva or raw Canvas?

- Richer object manipulation API (select, resize, rotate, group)
- Built-in serialization to/from JSON (critical for `.canvas` file format)
- Powers both PDF annotation overlay AND unlimited canvas with a single engine
- Better text editing support on canvas
- Active community and documentation

### Why MiniSearch over Lunr or FlexSearch?

- Smallest bundle size (~7KB gzipped)
- Supports both prefix search and fuzzy matching out of the box
- Field boosting allows ranking title matches above body matches
- Auto-suggest / autocomplete API for search-as-you-type
- Simple API for incremental index updates

### Why Zustand over Redux, Jotai, or React Context?

- Minimal boilerplate (no providers, reducers, or action types)
- Works outside React components (useful for file system callbacks)
- Built-in devtools middleware
- Excellent TypeScript support
- Immer middleware for ergonomic immutable updates

### Why pnpm over npm or yarn?

- Significantly faster installs via content-addressable store
- Strict dependency resolution prevents phantom dependencies
- Workspace support for potential monorepo structure
- Disk space efficient (shared packages across projects)
