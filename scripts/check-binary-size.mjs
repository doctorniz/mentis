// Checks the release desktop binary against the size budget in perf-budgets.json.
// Run after `pnpm tauri build`. Exits non-zero when an enforced budget is exceeded.
//
// Usage: node scripts/check-binary-size.mjs [path-to-binary]
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const budget = JSON.parse(fs.readFileSync(path.join(root, 'perf-budgets.json'), 'utf8')).binary

const exe = process.platform === 'win32' ? 'mentis.exe' : 'mentis'
const file = process.argv[2] ?? path.join(root, 'src-tauri', 'target', 'release', exe)
if (!fs.existsSync(file)) {
  console.error(`No binary at ${file}. Run \`pnpm tauri build\` first.`)
  process.exit(1)
}

const bytes = fs.statSync(file).size
const mb = (n) => (n / 1e6).toFixed(2)
const over = bytes > budget.maxBytes
const status = !over ? 'ok' : budget.enforce ? 'FAIL' : 'over (report only)'
console.log(
  `${budget.label}: ${mb(bytes)} / ${mb(budget.maxBytes)} MB  ${status}  (${path.relative(root, file)})`,
)
process.exit(over && budget.enforce ? 1 : 0)
