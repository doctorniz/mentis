/**
 * Dev-only hands-on QA checklist server — `pnpm qa`.
 *
 * Serves a self-contained checklist page (Desktop / Mobile / Future
 * tabs) and persists pass/fail/skip + notes to a git-ignored JSON at
 * the repo root, so progress survives restarts and is SHARED between
 * devices: it binds 0.0.0.0 — open the printed LAN URL on your phone
 * for the Mobile tab while the desktop drives the Desktop tab.
 *
 * Zero dependencies (node:http only). Never part of the app bundle,
 * build, or CI.
 */

import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checklist } from './qa-checklist-data.mjs'

const PORT = Number(process.env.QA_PORT ?? 4599)
const STATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.qa-checklist-state.json')

/* ------------------------------ state ------------------------------ */

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
    return parsed && typeof parsed.items === 'object' ? parsed : { items: {} }
  } catch {
    return { items: {} }
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

/* ------------------------------ export ----------------------------- */

function exportMarkdown() {
  const state = readState()
  const lines = [`# QA hands-on findings — ${new Date().toISOString().slice(0, 10)}`, '']
  const mark = { pass: '✅ pass', fail: '❌ FAIL', skip: '⏭ skip' }
  for (const device of ['desktop', 'mobile']) {
    lines.push(`## ${device[0].toUpperCase() + device.slice(1)}`, '')
    for (const section of checklist.sections.filter((s) => s.device === device)) {
      const rows = section.items.map((item) => ({ item, s: state.items[item.id] }))
      if (rows.every(({ s }) => !s?.status && !s?.note)) continue
      lines.push(`### ${section.title}`, '')
      for (const { item, s } of rows) {
        const status = s?.status ? mark[s.status] : '⬜ not run'
        lines.push(`- ${status} — ${item.title}`)
        if (s?.note?.trim()) {
          for (const noteLine of s.note.trim().split('\n')) lines.push(`  > ${noteLine}`)
        }
      }
      lines.push('')
    }
  }
  const failed = Object.entries(state.items).filter(([, s]) => s.status === 'fail')
  lines.push('---', '', `**Totals:** ${Object.values(state.items).filter((s) => s.status).length} run, ${failed.length} failing.`)
  return lines.join('\n')
}

/* ------------------------------- page ------------------------------ */

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mentis QA checklist</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fafafa; --card: #fff; --fg: #1c1c1e; --muted: #6e6e73; --line: #e3e3e6;
    --accent: #6d5ae6; --pass: #1a9e57; --fail: #d64545; --skip: #b58a2a;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #131316; --card: #1c1c21; --fg: #ececf1; --muted: #98989f; --line: #2c2c33; }
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; padding-bottom: 60px; }
  header { position: sticky; top: 0; z-index: 5; background: var(--bg); border-bottom: 1px solid var(--line); padding: 10px 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  header h1 { font-size: 15px; margin-right: auto; }
  header h1 small { color: var(--muted); font-weight: 400; }
  nav button, header .act { border: 1px solid var(--line); background: var(--card); color: var(--fg); border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
  nav button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
  main { max-width: 860px; margin: 0 auto; padding: 16px; }
  .prog { font-size: 12px; color: var(--muted); margin: 4px 0 14px; }
  section.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; margin-bottom: 14px; overflow: hidden; }
  section.card > h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; padding: 10px 14px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; }
  section.card > h2 span { color: var(--muted); font-weight: 400; text-transform: none; letter-spacing: 0; }
  .item { padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .item:last-child { border-bottom: 0; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .row .t { flex: 1 1 240px; font-weight: 500; }
  .row .t.done-pass { color: var(--pass); }
  .row .t.done-fail { color: var(--fail); }
  .row .t.done-skip { color: var(--skip); }
  .btns { display: flex; gap: 6px; }
  .btns button { border: 1px solid var(--line); background: transparent; color: var(--muted); border-radius: 7px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
  .btns button.on-pass { background: var(--pass); border-color: var(--pass); color: #fff; }
  .btns button.on-fail { background: var(--fail); border-color: var(--fail); color: #fff; }
  .btns button.on-skip { background: var(--skip); border-color: var(--skip); color: #fff; }
  details { margin-top: 6px; }
  summary { font-size: 12px; color: var(--muted); cursor: pointer; }
  ol { padding-left: 22px; font-size: 13px; color: var(--muted); margin-top: 4px; }
  textarea { width: 100%; margin-top: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 8px; padding: 6px 9px; font: 13px/1.4 system-ui; min-height: 34px; resize: vertical; display: none; }
  textarea.show, textarea.hasText { display: block; }
  .noteBtn { font-size: 11px; color: var(--muted); background: none; border: none; cursor: pointer; text-decoration: underline; }
  .future .item p { color: var(--muted); font-size: 13px; margin-top: 2px; }
  dialog { max-width: 720px; width: 92vw; border: 1px solid var(--line); border-radius: 12px; background: var(--card); color: var(--fg); padding: 16px; }
  dialog pre { white-space: pre-wrap; font: 12px/1.5 ui-monospace, monospace; max-height: 60vh; overflow: auto; background: var(--bg); border-radius: 8px; padding: 12px; }
  dialog .bar { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
</style>
</head>
<body>
<header>
  <h1>Mentis QA <small id="meta"></small></h1>
  <nav>
    <button data-tab="desktop" class="on">Desktop</button>
    <button data-tab="mobile">Mobile</button>
    <button data-tab="future">Future</button>
  </nav>
  <button class="act" id="exportBtn">Export findings</button>
</header>
<main>
  <div class="prog" id="prog"></div>
  <div id="content"></div>
</main>
<dialog id="exportDlg">
  <pre id="exportPre"></pre>
  <div class="bar">
    <button class="act" id="copyBtn">Copy</button>
    <button class="act" onclick="exportDlg.close()">Close</button>
  </div>
</dialog>
<script>
let DATA = null
let STATE = { items: {} }
let TAB = 'desktop'
const openNotes = new Set()

async function load() {
  DATA = await (await fetch('/api/checklist')).json()
  STATE = await (await fetch('/api/state')).json()
  document.getElementById('meta').textContent = 'updated ' + DATA.updated
  render()
  setInterval(refreshState, 5000) // share live progress across devices
}

async function refreshState() {
  try {
    const next = await (await fetch('/api/state')).json()
    if (JSON.stringify(next) !== JSON.stringify(STATE)) { STATE = next; render() }
  } catch {}
}

async function save(id, patch) {
  const cur = STATE.items[id] ?? {}
  STATE.items[id] = { ...cur, ...patch, at: new Date().toISOString() }
  render()
  await fetch('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
}

function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }

function render() {
  const el = document.getElementById('content')
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === TAB))

  if (TAB === 'future') {
    document.getElementById('prog').textContent = DATA.futureWorks.length + ' items on the future-works list (read-only)'
    el.innerHTML = '<section class="card future"><h2>Future works</h2>' +
      DATA.futureWorks.map((f) => '<div class="item"><div class="row"><div class="t">' + esc(f.title) + '</div></div><p>' + esc(f.note) + '</p></div>').join('') +
      '</section>'
    return
  }

  const sections = DATA.sections.filter((s) => s.device === TAB)
  const all = sections.flatMap((s) => s.items)
  const run = all.filter((i) => STATE.items[i.id]?.status).length
  const fails = all.filter((i) => STATE.items[i.id]?.status === 'fail').length
  document.getElementById('prog').textContent = run + ' / ' + all.length + ' run' + (fails ? ' · ' + fails + ' failing' : '')

  el.innerHTML = sections.map((sec) => {
    const done = sec.items.filter((i) => STATE.items[i.id]?.status).length
    return '<section class="card"><h2>' + esc(sec.title) + '<span>' + done + '/' + sec.items.length + '</span></h2>' +
      sec.items.map((item) => {
        const st = STATE.items[item.id] ?? {}
        const note = st.note ?? ''
        const btn = (kind, label) =>
          '<button class="' + (st.status === kind ? 'on-' + kind : '') + '" onclick="toggle(\\'' + item.id + '\\',\\'' + kind + '\\')">' + label + '</button>'
        return '<div class="item">' +
          '<div class="row"><div class="t' + (st.status ? ' done-' + st.status : '') + '">' + esc(item.title) + '</div>' +
          '<div class="btns">' + btn('pass', 'Pass') + btn('fail', 'Fail') + btn('skip', 'Skip') +
          '<button class="noteBtn" onclick="noteToggle(\\'' + item.id + '\\')">note</button></div></div>' +
          '<details><summary>steps</summary><ol>' + item.steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol></details>' +
          '<textarea id="note-' + item.id + '" placeholder="finding / observation" class="' + (note ? 'hasText' : '') + (openNotes.has(item.id) ? ' show' : '') + '"' +
          ' onchange="save(\\'' + item.id + '\\',{note:this.value})">' + esc(note) + '</textarea>' +
          '</div>'
      }).join('') + '</section>'
  }).join('')
}

function toggle(id, kind) {
  const cur = STATE.items[id]?.status
  save(id, { status: cur === kind ? null : kind })
}

function noteToggle(id) {
  openNotes.has(id) ? openNotes.delete(id) : openNotes.add(id)
  render()
  if (openNotes.has(id)) document.getElementById('note-' + id)?.focus()
}

document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => { TAB = b.dataset.tab; render() }))

document.getElementById('exportBtn').addEventListener('click', async () => {
  const md = await (await fetch('/api/export')).text()
  document.getElementById('exportPre').textContent = md
  document.getElementById('exportDlg').showModal()
})
document.getElementById('copyBtn').addEventListener('click', async () => {
  const text = document.getElementById('exportPre').textContent
  try { await navigator.clipboard.writeText(text) } catch {
    const r = document.createRange(); r.selectNodeContents(document.getElementById('exportPre'))
    getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy')
  }
})

load()
</script>
</body>
</html>`

/* ------------------------------ server ----------------------------- */

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(PAGE)
  }
  if (req.method === 'GET' && url.pathname === '/api/checklist') {
    return json(res, 200, checklist)
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return json(res, 200, readState())
  }
  if (req.method === 'POST' && url.pathname === '/api/state') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        const { id, status, note } = JSON.parse(body)
        if (typeof id !== 'string' || !id) return json(res, 400, { error: 'id required' })
        const state = readState()
        const cur = state.items[id] ?? {}
        const next = { ...cur, at: new Date().toISOString() }
        if (status !== undefined) {
          if (status === null) delete next.status
          else if (['pass', 'fail', 'skip'].includes(status)) next.status = status
          else return json(res, 400, { error: 'bad status' })
        }
        if (note !== undefined) next.note = String(note)
        state.items[id] = next
        writeState(state)
        json(res, 200, state)
      } catch {
        json(res, 400, { error: 'bad json' })
      }
    })
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/export') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    return res.end(exportMarkdown())
  }
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
})

server.listen(PORT, '0.0.0.0', () => {
  const urls = [`http://localhost:${PORT}`]
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) urls.push(`http://${iface.address}:${PORT}`)
    }
  }
  console.log('Mentis QA checklist:')
  for (const u of urls) console.log('  ' + u)
  console.log('(open the LAN URL on your phone for the Mobile tab; state is shared)')
})
