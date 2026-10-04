// Measures desktop cold start: process spawn -> the shell (file tree, editor
// area) is mounted. The release binary writes the time to the file named by
// MENTIS_STARTUP_REPORT and quits (see src-tauri/src/startup.rs); this script
// launches it repeatedly and reports the median against perf-budgets.json.
//
// Each launch opens a small throwaway vault: the script writes it into the
// recent-vaults file and names it in MENTIS_STARTUP_VAULT, which the app honours
// only alongside MENTIS_STARTUP_REPORT. One untimed launch first creates the
// webview profile, so the timed runs start from an installed, used app.
//
// It uses the app's real data folders, so it refuses to run where they already
// exist (a developer machine) unless --allow-real-profile is given, in which
// case it moves them aside and puts them back afterwards. CI is a fresh runner.
//
// Usage: node scripts/measure-cold-start.mjs [--runs 5] [--exe path] [--out file.json]
//                                            [--allow-real-profile]
// Windows only for now (WebView2); macOS and Linux are added with their bundles.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const budgets = JSON.parse(fs.readFileSync(path.join(root, 'perf-budgets.json'), 'utf8'))
const IDENTIFIER = 'app.mentis.desktop'
const LAUNCH_TIMEOUT_MS = 45_000

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const flag = (name) => process.argv.includes(`--${name}`)

if (process.platform !== 'win32') {
  console.error('Cold-start measurement currently supports Windows only.')
  process.exit(2)
}

const runs = Number(arg('runs', '5'))
const exe = arg('exe', path.join(root, 'src-tauri', 'target', 'release', 'mentis.exe'))
if (!fs.existsSync(exe)) {
  console.error(`No binary at ${exe}. Run \`pnpm tauri build\` first.`)
  process.exit(1)
}

const appData = path.join(process.env.APPDATA, IDENTIFIER)
const webProfile = path.join(process.env.LOCALAPPDATA, IDENTIFIER)
const existing = [appData, webProfile].filter((p) => fs.existsSync(p))
if (existing.length > 0 && !process.env.CI && !flag('allow-real-profile')) {
  console.error(
    `Refusing to run: ${existing.join(' and ')} already exist and belong to an installed or dev copy of the app.\n` +
      'Pass --allow-real-profile to move them aside for the run and restore them afterwards.',
  )
  process.exit(1)
}

const stamp = `bak-${process.pid}`
const movedAside = []
function moveAside() {
  for (const p of existing) {
    fs.renameSync(p, `${p}.${stamp}`)
    movedAside.push(p)
  }
}
// Even after settleWebview, Windows can hold a just-closed file briefly, so
// deleting retries while files are busy.
const LINGERING = { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }

function restore() {
  for (const p of [appData, webProfile]) fs.rmSync(p, LINGERING)
  for (const p of movedAside) fs.renameSync(`${p}.${stamp}`, p)
  movedAside.length = 0
}

function killTree(child) {
  if (child.pid && child.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  }
}

// The app's WebView2 processes outlive it after it quits, and a launch that
// finds them still running attaches to them instead of starting cold. They
// are found by the profile folder on their command line.
function webviewPids() {
  const profile = webProfile.replaceAll("'", "''")
  const out =
    spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process -Filter "Name=\'msedgewebview2.exe\'" | ' +
          `Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${profile}') } | ` +
          'ForEach-Object { $_.ProcessId }',
      ],
      { encoding: 'utf8' },
    ).stdout ?? ''
  return out.split(/\s+/).filter(Boolean)
}

const WEBVIEW_EXIT_TIMEOUT_MS = 15_000

/** Waits for the webview to exit, then ends whatever is left. Says what it had to do. */
async function settleWebview() {
  const start = Date.now()
  let pids = webviewPids()
  if (pids.length === 0) return ''
  while (pids.length && Date.now() - start < WEBVIEW_EXIT_TIMEOUT_MS) {
    await sleep(250)
    pids = webviewPids()
  }
  for (const pid of pids) spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' })
  const waited = Date.now() - start
  return pids.length
    ? `webview still running after ${waited} ms, ended ${pids.length} processes`
    : `webview exited ${waited} ms after the app`
}

// The app's own output, kept so a failed run can say why.
const appOutput = []
function launch(env) {
  const child = spawn(exe, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => appOutput.push(String(chunk)))
  }
  return child
}

// What was running when a launch stalled: the session the app is in (a
// service session cannot show windows), its WebView2 processes, its profile.
const diagnostics = []
function processReport() {
  const list = (image) =>
    spawnSync('tasklist', ['/V', '/FO', 'CSV', '/NH', '/FI', `IMAGENAME eq ${image}`], {
      encoding: 'utf8',
    })
      .stdout.split(/\r?\n/)
      .filter((l) => l.startsWith('"'))
  // Image, PID, session name, session #, status, window title.
  const describe = (row) => {
    const c = row.slice(1, -1).split('","')
    return [c[0], c[1], c[2], c[3], c[5], c[8]].join(' | ')
  }
  const app = list('mentis.exe')
  const web = list('msedgewebview2.exe')
  return [
    `App processes: ${app.length ? app.map((l) => describe(l)).join('; ') : 'none'}`,
    `WebView2 processes: ${web.length}`,
    `Webview profile created: ${fs.existsSync(path.join(webProfile, 'EBWebView'))}`,
  ]
}

function webView2Version() {
  const key = 'Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  for (const hive of [
    `HKLM\\SOFTWARE\\WOW6432Node\\${key}`,
    `HKLM\\SOFTWARE\\${key}`,
    `HKCU\\Software\\${key}`,
  ]) {
    const out = spawnSync('reg', ['query', hive, '/v', 'pv'], { encoding: 'utf8' }).stdout ?? ''
    const m = out.match(/pv\s+REG_SZ\s+(\S+)/)
    if (m && m[1] !== '0.0.0.0') return m[1]
  }
  return 'not found'
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function makeVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mentis-cold-start-'))
  fs.mkdirSync(path.join(dir, 'Notes', 'Projects'), { recursive: true })
  for (let i = 1; i <= 20; i++) {
    fs.writeFileSync(path.join(dir, 'Notes', `note-${i}.md`), `# Note ${i}\n\nSome text.\n`)
  }
  fs.writeFileSync(path.join(dir, 'Notes', 'Projects', 'plan.md'), '# Plan\n')
  return fs.realpathSync(dir)
}

async function launchOnce(report, vault) {
  fs.rmSync(report, { force: true })
  const spawnedAt = Date.now()
  const child = launch({ MENTIS_STARTUP_REPORT: report, MENTIS_STARTUP_VAULT: vault })
  const exited = new Promise((r) => child.once('exit', r))
  const timedOut = sleep(LAUNCH_TIMEOUT_MS).then(() => 'timeout')
  const result = await Promise.race([exited, timedOut])
  if (result === 'timeout') {
    diagnostics.push(...processReport())
    killTree(child)
    await settleWebview()
    throw new Error('the app did not report that the shell was up')
  }
  const settled = await settleWebview()
  if (!fs.existsSync(report)) throw new Error(`the app exited (${result}) without reporting`)
  return { ms: JSON.parse(fs.readFileSync(report, 'utf8')).readyAtMs - spawnedAt, settled }
}

const note = (settled) => (settled ? `  (${settled})` : '')

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

let vault
const samples = []
try {
  moveAside()
  vault = makeVault()
  fs.mkdirSync(appData, { recursive: true })
  fs.writeFileSync(
    path.join(appData, 'recent-vaults.json'),
    JSON.stringify([{ path: vault, openedAt: Date.now() }]),
  )
  const report = path.join(os.tmpdir(), `mentis-startup-${process.pid}.json`)
  const warm = await launchOnce(report, vault)
  console.log(`  warm-up: ${warm.ms} ms, not counted${note(warm.settled)}`)
  for (let i = 0; i < runs; i++) {
    const { ms, settled } = await launchOnce(report, vault)
    samples.push(ms)
    console.log(`  run ${i + 1}: ${ms} ms${note(settled)}`)
  }
} catch (err) {
  console.error(`Cold-start measurement failed: ${err.message}`)
  console.error(`  WebView2 runtime: ${webView2Version()}`)
  for (const line of diagnostics) console.error(`  ${line}`)
  const output = appOutput.join('').trim()
  console.error(output ? `  App output:\n${output.slice(-4000)}` : '  The app printed nothing.')
  process.exitCode = 1
} finally {
  await settleWebview()
  restore()
  if (vault) fs.rmSync(vault, LINGERING)
}

if (samples.length === runs) {
  const med = median(samples)
  const limit = budgets.timing.desktopColdStartMs
  const enforce = budgets.timingEnforce?.desktopColdStartMs === true
  const over = med > limit
  const status = !over ? 'ok' : enforce ? 'FAIL' : 'over (report only)'
  const line = `Desktop cold start: median ${med} ms (min ${Math.min(...samples)}, max ${Math.max(...samples)}, ${runs} runs) / ${limit} ms  ${status}`
  console.log(line)
  const out = arg('out')
  if (out)
    fs.writeFileSync(out, JSON.stringify({ medianMs: med, samples, limitMs: limit }, null, 2))
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`)
  if (over && enforce) process.exitCode = 1
}
