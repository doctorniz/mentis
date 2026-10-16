# Mentis — Code Conventions

How code in this repo is written. The principles, budgets and working
agreement are in [`CLAUDE.md`](../CLAUDE.md); the layout is explained in
[`ARCHITECTURE.md`](./ARCHITECTURE.md). _Last reviewed 2026-10-13._

## Project structure

```
mentis/
├── src/
│   ├── core/          # registries, index, capture grammar, convert, render — owned by no feature
│   ├── modules/       # one folder per feature; registers itself (register.ts, view.ts, settings.ts, …)
│   ├── components/    # React UI by domain
│   ├── lib/           # framework-free logic by domain
│   ├── stores/        # Zustand + Immer stores
│   ├── contexts/      # vault session, notes workspace, sync
│   └── types/         # shared types
├── src-tauri/         # Rust shell (desktop + Android); gen/android is the Android project
├── tests/             # Vitest unit tests; tests/e2e — Playwright specs + fixtures
├── scripts/           # budgets, cold-start measurement, release version check, QA checklist server
├── public/            # PWA manifest, icons, service worker, worker assets
├── docs/              # documentation (index in README); docs/archive — historical
└── .github/workflows/ # ci.yml, android-release.yml
```

**Import boundaries** (ESLint): a module never imports another module — go
through `@/core` or a registry. `core/` imports neither `modules/` nor
`components/`.

## Naming

| Kind                            | Convention                                                             | Example                            |
| ------------------------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| Files (components, lib, stores) | kebab-case                                                             | `task-row.tsx`, `use-swipe.ts`     |
| Tests                           | `*.test.ts(x)`; e2e `NN-topic.spec.ts`                                 | `pen.test.ts`, `30-touch.spec.ts`  |
| Components, types, interfaces   | PascalCase                                                             | `TaskRow`, `VaultConfig`           |
| Functions, variables            | camelCase                                                              | `createVault`, `searchResults`     |
| Constants                       | SCREAMING_SNAKE_CASE                                                   | `TASKS_DIR`                        |
| Zustand stores                  | `use[Name]Store`                                                       | `useTasksStore`                    |
| Hooks                           | `use[Name]`                                                            | `useHoldToReorder`                 |
| Event handlers                  | `handle[Event]` / `on[Event]`                                          | `handleToggle`, `onSaved`          |
| Rust                            | `snake_case` modules and functions; Tauri commands named `area_action` | `vault_read`, `reminders_schedule` |

Import with the `@/` alias (`@/*` → `src/*`); never relative paths more than
one level up.

## Components

```tsx
// 1. Imports: external, then internal, then types
import { useCallback, useState } from 'react'
import { cn } from '@/utils/cn'
import type { FileEntry } from '@/types/files'

// 2. Props
interface FileTreeItemProps {
  entry: FileEntry
  depth: number
  onSelect: (entry: FileEntry) => void
}

// 3. A named export
export function FileTreeItem({ entry, depth, onSelect }: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(false)
  const handleClick = useCallback(() => onSelect(entry), [entry, onSelect])
  return <div className={cn('flex items-center', depth > 0 && 'ml-4')}>{/* … */}</div>
}
```

- Lazy-load anything heavy (`React.lazy`, dynamic `import()`); editors and
  views are lazy through their registries.
- Never nest interactive elements (`<button>` in `<button>`). For tabs with a
  close control, use a focusable `role="tab"` element and a separate button.
- After a file rename, an editor's unmount cleanup still holds the old path:
  skip the flush when the tab's path has moved, or the old file is recreated.

## Stores

```ts
export const useVaultStore = create<VaultState>()(
  immer((set, get) => ({
    config: null,
    setConfig: (config) =>
      set((state) => {
        state.config = config
      }),
  })),
)
```

With Immer, do not put `Set` or `Map` in state (`enableMapSet()` is never
called); use arrays or `Record<string, true>`.

## Styling

- Tailwind utilities; `cn()` (clsx + tailwind-merge) for conditional classes;
  CVA for component variants. No CSS modules or styled-components.
- Theme tokens are CSS variables in `src/globals.css`. Dark mode is class-based
  (`.dark` on `<html>`), set before paint by `public/boot.js` from
  `localStorage('ink-theme')`. No inline scripts: the content security policy
  forbids them (see `docs/DEPLOYMENT.md`).
- Phones: `safe-top` / `safe-bottom` / `safe-x` keep content clear of the
  system bars; `pointer-coarse:` enlarges touch targets.
- UI copy: as few words as possible; a hint under a setting only when it
  prevents a real mistake.

## Errors

- File operations catch and report; user-facing errors go through
  `toast.error()` (`@/stores/toast`), with the `console.error`/`console.warn`
  kept beside it for the stack.
- Never swallow a failure silently in background work (reminders, sync,
  indexing): log it with a short prefix such as `[reminders]`.

## Testing

| Layer | Tool       | Covers                                                            |
| ----- | ---------- | ----------------------------------------------------------------- |
| Unit  | Vitest     | pure logic: parsing, recurrence, reminders, index store, adapters |
| E2E   | Playwright | real flows on the production build, desktop and phone profiles    |
| Rust  | cargo test | the shell: file access, index, reminders, sign-in                 |

Before merging: `typecheck`, `lint` and the unit tests after the last edit,
the build and budgets, and the full e2e suite on the production build
(`pnpm build` then `CI=1 pnpm exec playwright test`). Behaviour only a person
can check goes in the manual verification queue in
[`LAUNCH_DEFERRALS.md`](./LAUNCH_DEFERRALS.md).

## Git

- One task per branch: `feat/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`.
- Conventional Commits: `type(scope): description`, with the why in the body.
- Commit at every green build; merge to `main` fast-forward once CI-equivalent
  checks pass locally.

## License

Mentis is under the [Business Source License 1.1](../LICENSE) (summary in the
README); `package.json` says `"SEE LICENSE IN LICENSE"`. Third-party packages
keep their own licences.
