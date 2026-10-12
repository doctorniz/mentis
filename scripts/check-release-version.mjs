// A release tag must name the app's version everywhere it is written, so the
// Play version code (derived from it) and the app's own version agree.
// Usage: node scripts/check-release-version.mjs v0.2.0
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const tag = process.argv[2] ?? ''
const wanted = tag.replace(/^v/, '')
if (!/^\d+\.\d+\.\d+$/.test(wanted)) {
  console.error(`"${tag}" is not a release tag (vMAJOR.MINOR.PATCH).`)
  process.exit(1)
}

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const found = {
  'package.json': JSON.parse(read('package.json')).version,
  'src-tauri/tauri.conf.json': JSON.parse(read('src-tauri/tauri.conf.json')).version,
  'src-tauri/Cargo.toml': /^version\s*=\s*"([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))?.[1],
}
const wrong = Object.entries(found).filter(([, v]) => v !== wanted)
for (const [file, v] of wrong) console.error(`${file} says ${v}; the tag says ${wanted}.`)
if (wrong.length) process.exit(1)

const [major, minor, patch] = wanted.split('.').map(Number)
console.log(
  `Releasing ${wanted} (Android version code ${major * 1_000_000 + minor * 1_000 + patch}).`,
)
