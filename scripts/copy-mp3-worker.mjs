/**
 * Postinstall script — copies mp3-mediarecorder worker + vmsg WASM to public/
 * so they can be loaded at runtime without bundler intervention.
 *
 * Run automatically via `pnpm install` (postinstall hook) or manually:
 *   node scripts/copy-mp3-worker.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const publicDir = join(root, 'public')

// Ensure public/ exists
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true })

const files = [
  {
    src: join(root, 'node_modules/mp3-mediarecorder/worker/index.umd.js'),
    dest: join(publicDir, 'mp3-recorder-worker.js'),
  },
  {
    src: join(root, 'node_modules/mp3-mediarecorder/dist/vmsg.wasm'),
    dest: join(publicDir, 'vmsg.wasm'),
  },
]

let ok = true
for (const { src, dest } of files) {
  if (!existsSync(src)) {
    // Silently skip if mp3-mediarecorder isn't installed yet (e.g. first install)
    console.warn(`[copy-mp3-worker] skipping ${src} (not found)`)
    ok = false
    continue
  }
  copyFileSync(src, dest)
}

if (ok) {
  console.log('[copy-mp3-worker] copied worker + WASM to public/')
}
