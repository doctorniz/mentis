/**
 * Postinstall script — copies the PDF.js worker to public/ so it can be loaded
 * at runtime without bundler intervention.
 *
 * `src/lib/pdf/pdfjs-loader.ts` previously resolved the worker with
 * `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`, which only
 * webpack understands — Vite does not resolve bare specifiers inside `new URL`.
 * Serving it from public/ works under any bundler and keeps the worker version
 * locked to the installed pdfjs-dist.
 *
 * Unlike the mp3 worker, the output is NOT committed: it is 1.3 MB and is
 * reproduced exactly by this script on every install.
 *
 * Run automatically via `pnpm install` (postinstall hook) or manually:
 *   node scripts/copy-pdf-worker.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const publicDir = join(root, 'public')

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true })

const src = join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
const dest = join(publicDir, 'pdf.worker.min.mjs')

if (!existsSync(src)) {
  console.warn(`[copy-pdf-worker] skipping ${src} (not found)`)
} else {
  copyFileSync(src, dest)
  console.log('[copy-pdf-worker] copied PDF.js worker to public/')
}
