# Mentis â€” Code Conventions

## License

| Item                             | Detail                                                                                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Full text**                    | Root [`LICENSE`](../LICENSE) â€” **Business Source License 1.1** (MariaDB-style parameters + terms).                                                                                                                      |
| **Licensor / work**              | **Marrow Group** / **Mentis** (this repository).                                                                                                                                                                        |
| **Additional Use Grant**         | Production use for **any purpose** (see `LICENSE` â€” adjust only with legal review).                                                                                                                                     |
| **Change Date / Change License** | **2030-04-09** / **MPL 2.0** (edit in `LICENSE` if policy changes).                                                                                                                                                     |
| **`package.json`**               | `"license": "SEE LICENSE IN LICENSE"`.                                                                                                                                                                                  |
| **README**                       | **AI assistance** section â€” tooling disclosure; **License** section â€” pointer to BSL; neither replaces `LICENSE`.                                                                                                       |
| **Docs**                         | [`ARCHITECTURE.md`](./ARCHITECTURE.md) Â§10, [`TECH_STACK.md`](./TECH_STACK.md) (footer), [`PRD.md`](./PRD.md) Â§6, [`DEPLOYMENT.md`](./DEPLOYMENT.md) (static hosting / headers), this file, [`CURSOR.md`](./CURSOR.md). |

Third-party npm packages remain under their respective licenses.

## Project Structure

```
ink-marrow/
├── docs/                  # Project documentation (see README's doc index)
├── tests/                 # Vitest unit tests (default env: node; happy-dom per file where needed)
│   └── e2e/               # Playwright specs (chromium + Pixel-5 mobile projects) + fixtures
├── public/                # PWA: manifest, icons, sw.js, MP3 worker + vmsg.wasm
├── scripts/               # copy-mp3-worker (postinstall), qa-checklist server (pnpm qa)
├── src/
│   ├── app/               # Next.js App Router shell (layout, page, auth/dropbox return)
│   ├── components/        # React UI by domain: shell, views, notes, pdf, canvas, board,
│   │                      # tasks, calendar, bookmarks, kanban, mindmap, pptx, chat,
│   │                      # file-browser, graph, search, audio, ui
│   ├── contexts/          # vault-fs, notes-workspace, sync providers
│   ├── hooks/             # use-auto-save
│   ├── lib/               # Framework-free logic, one folder per domain (fs, vault, editor,
│   │                      # markdown, notes, pdf, canvas, search, sync, chat, board, tasks,
│   │                      # calendar, bookmarks, kanban, mindmap, spreadsheet, code, audio,
│   │                      # graph, snapshot, file-browser, browser)
│   ├── stores/            # Zustand + Immer stores, one per domain
│   ├── types/             # Shared TypeScript types
│   └── utils/             # cn.ts (clsx + tailwind-merge)
├── .cursor/rules/         # Cursor AI rules (.mdc)
├── .github/workflows/     # CI (typecheck, lint, unit, build, e2e)
├── next.config.ts         # Static export; server-side stubs for browser-only libs
├── playwright.config.ts   # E2E: dev server locally, static export on CI
└── CLAUDE.md              # AI working notes — the most detailed, most current module reference
```

The root CLAUDE.md is kept current with every change and is the best per-module reference; this file covers the stable conventions.

## Naming Conventions

### Files & Directories

| Type             | Convention                   | Example               |
| ---------------- | ---------------------------- | --------------------- |
| React components | PascalCase                   | `FileTreeSidebar.tsx` |
| Hooks            | camelCase with `use` prefix  | `useVaultStore.ts`    |
| Utilities/lib    | kebab-case                   | `pdf-annotations.ts`  |
| Types            | kebab-case                   | `vault-types.ts`      |
| Stores           | kebab-case                   | `file-tree.ts`        |
| Tests            | `*.test.ts` / `*.test.tsx`   | `vault.test.ts`       |
| Constants        | SCREAMING_SNAKE_CASE in file | `MAX_SNAPSHOT_COUNT`  |

### Code

| Type             | Convention                     | Example                     |
| ---------------- | ------------------------------ | --------------------------- |
| Components       | PascalCase                     | `FileTreeSidebar`           |
| Functions        | camelCase                      | `createVault()`             |
| Variables        | camelCase                      | `searchResults`             |
| Constants        | SCREAMING_SNAKE_CASE           | `MAX_SNAPSHOTS_PER_FILE`    |
| Types/Interfaces | PascalCase                     | `VaultConfig`, `FileEntry`  |
| Enums            | PascalCase (members too)       | `ViewMode.FileBrowser`      |
| Zustand stores   | `use[Name]Store`               | `useVaultStore`             |
| Event handlers   | `handle[Event]` or `on[Event]` | `handleFileClick`, `onDrop` |

## Component Patterns

### Accessibility (HTML)

- Never nest interactive elements (`<button>` inside `<button>`, etc.). For tab UIs with a close control, use a focusable `<div role="tab">` (with `tabIndex` and keyboard activation) and keep actions like â€œcloseâ€ as separate `<button>`s.

### Notes editor & vault rename

- After a file rename, `MarkdownNoteEditor`â€™s `useEffect` cleanup still closes over the **previous** `path`. Flushing save with that path **recreates** the old file (duplicate next to the new one). Skip the flush when `pathRef.current !== path` (tab path already retargeted).

### Component File Structure

```tsx
// 1. Imports (external, then internal, then types)
import { useState, useCallback } from 'react'
import { cn } from '@/utils/cn'
import type { FileEntry } from '@/types/vault'

// 2. Types specific to this component
interface FileTreeItemProps {
  entry: FileEntry
  depth: number
  onSelect: (entry: FileEntry) => void
}

// 3. Component definition (named export)
export function FileTreeItem({ entry, depth, onSelect }: FileTreeItemProps) {
  // hooks first
  const [isExpanded, setIsExpanded] = useState(false)

  // handlers
  const handleClick = useCallback(() => {
    onSelect(entry)
  }, [entry, onSelect])

  // render
  return <div className={cn('flex items-center', depth > 0 && 'ml-4')}>{/* ... */}</div>
}
```

### Zustand Store Pattern

```tsx
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface VaultState {
  path: string | null
  config: VaultConfig | null

  // Actions
  openVault: (path: string) => Promise<void>
  closeVault: () => void
}

export const useVaultStore = create<VaultState>()(
  immer((set, get) => ({
    path: null,
    config: null,

    openVault: async (path) => {
      // ...
      set((state) => {
        state.path = path
      })
    },

    closeVault: () => {
      set((state) => {
        state.path = null
        state.config = null
      })
    },
  })),
)
```

**Immer + collections:** Do not put `Set` or `Map` in Zustand state when using the `immer` middleware unless you call `enableMapSet()` at app init. Prefer `Record<string, true>` (or string arrays) for set-like dataâ€”see `file-tree`, `pdf`, and `canvas` stores.

## Import Aliases

```json
{
  "@/*": ["./src/*"]
}
```

Always use `@/` path aliases for imports within `src/`. Never use relative paths that go more than one level up (`../../`).

## Styling Guidelines

- Use Tailwind CSS utility classes as the primary styling method.
- Use `cn()` utility (clsx + tailwind-merge) for conditional and merged classes.
- Use CSS variables in `globals.css` for theme tokens (colors, spacing, radii).
- Component variants defined with `class-variance-authority` (CVA).
- No CSS modules or styled-components.
- Dark mode via Tailwind v4 `@variant dark` (class-based): `.dark` on `<html>` toggles CSS custom properties. Anti-flash inline script in `layout.tsx` reads `localStorage('ink-theme')` before paint. Three-state toggle (Light / System / Dark) in sidebar. `useUiStore.setTheme()` persists choice and syncs the class.
- **Settings / forms:** avoid a second line of explanatory â€œhintâ€ text under every label unless it prevents a real mistake. AI guidance: `.cursor/rules/ui-copy.mdc`.

## Error Handling

- File system operations are wrapped in try/catch and return `Result<T, Error>` types where possible.
- User-facing errors are shown via toast notifications â€” import `toast` from `@/stores/toast` and call `toast.error(msg)`, `toast.warning(msg)`, `toast.success(msg)`, or `toast.info(msg)`. The `<Toaster>` component is mounted in `app-root.tsx`.
- Always keep the `console.error` alongside the toast so developers see full stack traces.
- Critical errors (vault corruption, write failures) show modal dialogs with recovery options (`ErrorBoundary`).

## Testing Strategy

| Layer       | Tool                     | Focus                                                   |
| ----------- | ------------------------ | ------------------------------------------------------- |
| Unit        | Vitest                   | Pure functions, store logic, adapters                   |
| Integration | Vitest + Testing Library | Component interactions, store + component               |
| E2E         | Playwright               | Full user flows (create vault, edit note, annotate PDF) |

## Git Conventions

### Branch Names

- `feat/description` â€” new feature
- `fix/description` â€” bug fix
- `refactor/description` â€” code restructuring
- `docs/description` â€” documentation
- `chore/description` â€” tooling, deps, config

### Commit Messages

Follow Conventional Commits:

```
type(scope): description

feat(editor): add slash command menu
fix(pdf): prevent annotation loss on interrupted save
refactor(fs): extract common adapter interface
docs(readme): add development setup instructions
```

### PR Conventions

- One feature/fix per PR
- PR description includes summary + test plan
- Screenshots for UI changes
- All CI checks must pass

## Cursor & AI assistant

- Project rules live in **`.cursor/rules/`** (`.mdc` files). See **`docs/CURSOR.md`** for the current list and purpose.
- When using Cursor Agent on this repo, the default expectation is: greet with **Assalamualaikum** on substantive help, and **update `docs/`** (and `README.md` when needed) at the end of runs that change behavior, architecture, or dependenciesâ€”then summarize which doc files changed in the final reply.
- For **UX or user-visible behavior** changes, also refresh **`docs/LAUNCH_DEFERRALS.md` â†’ _Manual verification queue_ â†’ _To do_** (and move verified rows to **Done**); repeat that checklist in the closeout under **Manual verification** so a human can smoke-test in the app.
