/**
 * Node globals that webpack injected for us and Vite does not.
 *
 * Next/webpack automatically shimmed `Buffer` and `global` for browser builds.
 * Vite deliberately does not polyfill Node globals, so any dependency reaching
 * for them throws at runtime. Restoring them here keeps the Vite bundle's
 * runtime semantics identical to the Next build.
 *
 * - `Buffer`: gray-matter calls `Buffer.from()` on every frontmatter parse and
 *   stringify (gray-matter/lib/utils.js → toBuffer, via lib/to-file.js). Without
 *   it, board, tasks, bookmarks, calendar, kanban, search indexing and markdown
 *   save all fail with `ReferenceError: Buffer is not defined`. js-yaml and
 *   section-matter (both gray-matter deps) reference it too.
 * - `global`: referenced by jszip, xlsx, pdf-lib, turndown and minisearch, mostly
 *   inside UMD environment guards. Assigning the real global object mirrors what
 *   webpack's shim resolved to.
 *
 * A runtime shim is used rather than Vite's `define: { global: 'globalThis' }`
 * because `define` is a textual substitution and would also rewrite any local
 * variable named `global`.
 *
 * Imported first by every entry so both exist before any module body runs.
 */
import { Buffer } from 'buffer'

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer
}

if (typeof (globalThis as { global?: unknown }).global === 'undefined') {
  ;(globalThis as { global?: unknown }).global = globalThis
}
