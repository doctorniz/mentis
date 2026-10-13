# Mentis — Tech Stack

The libraries Mentis is built on, and why. Versions are in `package.json` and
`src-tauri/Cargo.toml`; adding a dependency needs approval and a note of its
bundle cost (`CLAUDE.md`). _Last reviewed 2026-10-13._

## Front end (every platform)

| Area  | Libraries                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build | **Vite 7** (multi-page: app, desktop capture overlay, Dropbox return), TypeScript 5                                                               |
| UI    | **React 19**, Tailwind CSS 4, Radix UI primitives, Lucide icons, class-variance-authority, tailwind-merge, framer-motion, @tanstack/react-virtual |
| State | **Zustand** + Immer                                                                                                                               |
| Fonts | Inter, self-hosted (@fontsource-variable)                                                                                                         |

## Features

| Feature            | Libraries                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notes              | **Tiptap** (ProseMirror) + extensions; marked and turndown for Markdown ↔ editor; gray-matter for frontmatter; KaTeX; lowlight                                                         |
| Code / source mode | **CodeMirror 6** with language packs                                                                                                                                                   |
| PDF                | **pdf.js** (render, text), **pdf-lib** (write annotations and pages), **Fabric.js** (annotation overlay)                                                                               |
| Drawing canvas     | **PixiJS 8** (WebGL, layered raster)                                                                                                                                                   |
| Mindmaps           | **@xyflow/react**                                                                                                                                                                      |
| Slides             | **@marp-team/marp-core** (rendered in a worker)                                                                                                                                        |
| Office             | mammoth (Word → HTML → Markdown), slidecanvas + JSZip (PowerPoint), SheetJS + jspreadsheet-ce (spreadsheets, view only)                                                                |
| Media              | plyr (audio, video), mp3-mediarecorder (voice notes)                                                                                                                                   |
| Capture            | **chrono-node** (dates; English locale only, loaded lazily)                                                                                                                            |
| Search index       | **SQLite + FTS5**: sqlite-wasm on the web (in a worker), rusqlite in the apps; MiniSearch only for fuzzy title matching                                                                |
| AI                 | provider streaming clients (Anthropic, OpenAI, OpenRouter, Gemini, Ollama); **@mediapipe/tasks-genai** for Gemma on the device (WebGPU); **transformers.js** for Whisper transcription |

## The apps (Tauri 2)

| Area    | Crates and plugins                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| Shell   | **Tauri 2** (desktop with tray; Android)                                                                       |
| Index   | rusqlite (bundled SQLite, FTS5), strsim, regex                                                                 |
| Files   | notify (desktop file watching); Android: the Storage Access Framework from Kotlin, over JNI (jni, ndk-context) |
| Plugins | dialog, opener, notification; desktop only: global-shortcut, single-instance, autostart                        |
| Android | Kotlin in `src-tauri/gen/android` (AndroidX), Gradle                                                           |

## Tooling

| Tool                    | Use                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| pnpm                    | packages (CI: 9.15; the lockfile is written by pnpm 10)                                           |
| ESLint (flat), Prettier | lint (including import boundaries between modules) and formatting                                 |
| Vitest (+ happy-dom)    | unit tests in `tests/`                                                                            |
| Playwright              | end-to-end in `tests/e2e/`: desktop Chromium and a Pixel 5 profile, on the production build in CI |
| cargo fmt, clippy, test | the Rust shell                                                                                    |
| GitHub Actions          | `ci.yml` (verify, e2e, desktop, android) and `android-release.yml` (signed releases)              |

## Key decisions

**Tauri, not Electron or Capacitor** — one Rust shell for desktop and mobile,
small binaries (the desktop budget is 15 MB), real filesystem access, and a
place for work that must not run in a webview (the index, reminder timers).

**Vite, not Next.js** — Mentis is a static app with no server; Vite builds it
simply and makes lazy loading per file type straightforward. (Migrated
2026-09-28.)

**SQLite + FTS5 for the index** — one store for search, the file manifest, the
folder tree, sync hashes, links and reminders, persisted between launches so
nothing walks the disk at startup. The same schema runs as sqlite-wasm in the
browser and rusqlite in the apps.

**Tiptap** — ProseMirror's model with an extension system that fits wiki-links,
embeds and slash commands, without building an editor from raw ProseMirror.

**Fabric.js for PDF annotations** — an object model for shapes, ink and text
over each rendered page; pdf-lib then writes them into the PDF as standard
annotations.

**PixiJS for the canvas** — GPU raster painting with layers, blend modes and
large surfaces that Canvas 2D handles poorly.

**Zustand** — small, explicit stores without providers; Immer for nested
updates.

**chrono-node for dates** — deterministic parsing; AI is never used to read
dates.

## License

Mentis: [Business Source License 1.1](../LICENSE) (summary in the README).
Third-party packages keep their own licences.
