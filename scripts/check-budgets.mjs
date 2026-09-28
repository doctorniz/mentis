// Checks the built app (`out/`) against the size budgets in perf-budgets.json.
// Run after `pnpm build`. Exits non-zero when an enforced budget is exceeded.
//
// Sizes come from Vite's build manifest, so they follow the real import graph
// rather than chunk names:
// - initial: everything index.html loads before any lazy import.
// - firstPdf: what opening the first PDF adds on top of that — the PDF editor
//   and its static imports, plus pdf.js. The pdf.js worker runs off the main
//   thread and is not counted.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'out')
const budgets = JSON.parse(fs.readFileSync(path.join(root, 'perf-budgets.json'), 'utf8')).size

const manifestPath = path.join(outDir, '.vite', 'manifest.json')
if (!fs.existsSync(manifestPath)) {
  console.error(`No build manifest at ${manifestPath}. Run \`pnpm build\` first.`)
  process.exit(1)
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

const gzipSize = (file) => zlib.gzipSync(fs.readFileSync(path.join(outDir, file))).length

/** Manifest keys reachable from `key` through static imports. */
function staticClosure(key, seen = new Set()) {
  if (seen.has(key)) return seen
  seen.add(key)
  for (const dep of manifest[key].imports ?? []) staticClosure(dep, seen)
  return seen
}

/** Gzipped JS and CSS bytes of a set of manifest keys. */
function measure(keys) {
  let js = 0
  const css = new Set()
  for (const key of keys) {
    js += gzipSize(manifest[key].file)
    for (const file of manifest[key].css ?? []) css.add(file)
  }
  let cssBytes = 0
  for (const file of css) cssBytes += gzipSize(file)
  return { js, css: cssBytes }
}

function findKey(pattern, what) {
  const key = Object.keys(manifest).find((k) => pattern.test(k))
  if (!key) {
    console.error(`Could not find ${what} in the build manifest (${pattern}).`)
    process.exit(1)
  }
  return key
}

const initialKeys = staticClosure(findKey(/^index\.html$/, 'the app entry'))
const initial = measure(initialKeys)

const pdfKeys = new Set([
  ...staticClosure(findKey(/^src\/modules\/pdf\/editor\.tsx$/, 'the PDF editor')),
  ...staticClosure(findKey(/pdfjs-dist\/build\/pdf\.mjs$/, 'pdf.js')),
])
for (const key of initialKeys) pdfKeys.delete(key)
const firstPdf = measure(pdfKeys)

const measured = {
  initialJs: initial.js,
  initialTotal: initial.js + initial.css,
  firstPdf: firstPdf.js + firstPdf.css,
}

const kb = (bytes) => bytes / 1024
let failed = false
console.log('Size budgets (gzipped KiB)\n')
for (const [id, budget] of Object.entries(budgets)) {
  const value = kb(measured[id])
  const over = value > budget.maxKb
  const status = !over ? 'ok' : budget.enforce ? 'FAIL' : 'over (report only)'
  if (over && budget.enforce) failed = true
  console.log(
    `  ${budget.label.padEnd(38)} ${value.toFixed(1).padStart(7)} / ${String(budget.maxKb).padStart(4)}  ${status}`,
  )
}

// The ratchet only moves down: say so when there is room to tighten it.
const slack = budgets.initialTotal.maxKb - Math.ceil(kb(measured.initialTotal))
if (slack > 0) {
  console.log(
    `\n  Initial JS + CSS is now ${kb(measured.initialTotal).toFixed(1)} KiB: lower its maxKb to ${Math.ceil(kb(measured.initialTotal))}.`,
  )
}

if (failed) {
  console.error('\nA size budget was exceeded. Do not raise the budget to make the build pass.')
  process.exit(1)
}
