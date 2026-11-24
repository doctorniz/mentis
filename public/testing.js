// Release checklist for mentis.ink/testing. Not part of the app: a static
// page whose results stay in this browser's localStorage.
// Item ids are the keys of saved results; reword freely, rename with care.
;(() => {
  'use strict'

  const PLATFORMS = [
    { id: 'web', name: 'Website' },
    { id: 'windows', name: 'Windows' },
    { id: 'mac', name: 'macOS' },
    { id: 'linux', name: 'Linux' },
    { id: 'android', name: 'Android' },
    { id: 'iphone', name: 'iPhone' },
    { id: 'ipad', name: 'iPad' },
  ]

  const ALL = PLATFORMS.map((p) => p.id)
  const DESKTOP = ['windows', 'mac', 'linux']
  const APPS = ALL.filter((p) => p !== 'web')
  const IOS = ['iphone', 'ipad']
  const PHONES = ['android', 'iphone']
  const TOUCH = ['android', 'iphone', 'ipad']
  const NOT_IOS = ALL.filter((p) => !IOS.includes(p))

  /** @type {{ title: string, items: { id: string, title: string, how: string, on: string[] }[] }[]} */
  const SECTIONS = [
    {
      title: 'Install and launch',
      items: [
        {
          id: 'install',
          title: 'Installs or updates from this release',
          how: 'Windows installer, Mac .dmg, Linux AppImage or .deb, Play test track, TestFlight. About shows the version under test.',
          on: APPS,
        },
        {
          id: 'web-load',
          title: 'mentis.ink loads the new build',
          how: 'Hard reload; About shows the version. Chrome or Edge, then Safari or Firefox.',
          on: ['web'],
        },
        {
          id: 'icon',
          title: 'The brain icon everywhere',
          how: 'Home screen, launcher or Start menu, task switcher, Settings, Spotlight. No black corners or default logo.',
          on: APPS,
        },
        {
          id: 'mac-gatekeeper',
          title: 'Opens past Gatekeeper',
          how: 'Unsigned: allow it in System Settings › Privacy & Security. Signed: no warning.',
          on: ['mac'],
        },
        {
          id: 'cold-start',
          title: 'Starts quickly and reopens the last vault',
          how: 'Quit fully and relaunch: the last vault opens with no dialog, under about a second on desktop, two on a phone.',
          on: APPS,
        },
        {
          id: 'csp',
          title: 'No security-policy errors',
          how: 'With DevTools open while using the app, sync and chat: no “Content Security Policy” errors in the console.',
          on: ['web', ...DESKTOP],
        },
      ],
    },
    {
      title: 'Vaults',
      items: [
        {
          id: 'vault-new',
          title: 'Create a new vault',
          how: 'It opens with Welcome.md, and Calendar, Tasks, Thoughts and Bookmarks at the top of the tree.',
          on: ALL,
        },
        {
          id: 'vault-open',
          title: 'Open an existing folder',
          how: 'Website: folder picker in Chrome or Edge. Android: a folder picked in the system picker. iOS: a folder on the device and one in iCloud Drive.',
          on: ALL,
        },
        {
          id: 'vault-space',
          title: 'A folder with a space keeps its name',
          how: 'The masthead and Welcome.md show “Test Vault”, not primary%3A…',
          on: ['android'],
        },
        {
          id: 'vault-files-app',
          title: 'New vault shows in Files',
          how: 'Files › On My iPhone/iPad › Mentis. Edit a note there; the app shows it on return.',
          on: IOS,
        },
        {
          id: 'vault-outside-edit',
          title: 'Edits made outside the app show up',
          how: 'Change a note in another editor or file manager, come back: the new text is there.',
          on: [...DESKTOP, 'android'],
        },
        {
          id: 'vault-switch',
          title: 'Switch between two recent vaults',
          how: 'From the landing page; capture then saves into the one that is open.',
          on: ALL,
        },
        {
          id: 'vault-relaunch',
          title: 'A picked folder survives a relaunch and an update',
          how: 'Force-quit and reopen, and after installing over the previous version: the vault still opens.',
          on: TOUCH,
        },
      ],
    },
    {
      title: 'Notes',
      items: [
        {
          id: 'note-write',
          title: 'Write and reopen a note',
          how: 'Headings, bold, a list, a table and a link. Close and reopen: exactly as written. Bold, Enter, type: the new line is plain.',
          on: ALL,
        },
        {
          id: 'note-rename-links',
          title: 'Renaming keeps links',
          how: 'Rename a note that another links with [[Name]]: the link follows and a toast says so.',
          on: ALL,
        },
        {
          id: 'note-search',
          title: 'Search finds it',
          how: 'A word from a note and from a PDF: results in under a second; opening one lands on it.',
          on: ALL,
        },
        {
          id: 'note-selection-menu',
          title: 'Selection menu on a phone',
          how: 'Select a word: Bold, Italic, Underline, Heading and Link appear clear of the system menu and work in one tap.',
          on: TOUCH,
        },
        {
          id: 'note-resume',
          title: 'Leaving and coming back',
          how: 'Switch to another app and back: the open note or the tree is still there.',
          on: TOUCH,
        },
      ],
    },
    {
      title: 'Today, tasks and calendar',
      items: [
        {
          id: 'today',
          title: 'Today shows the day',
          how: 'The journal, and tasks due today and yesterday (not tomorrow). Tick one: it is done in its note.',
          on: ALL,
        },
        {
          id: 'task-line',
          title: 'A task written in a note',
          how: '“- [ ] Pay rent >tomorrow 09:00 !2” shows in Tasks and on the calendar. Ticking writes done: with today’s date.',
          on: ALL,
        },
        {
          id: 'task-subtasks',
          title: 'Subtasks are saved',
          how: 'In a task’s details add a subtask: it is saved indented under the task.',
          on: ALL,
        },
        {
          id: 'reminder',
          title: 'A reminder fires on time',
          how: 'A task a minute ahead with the app in the background: the notification arrives; Snooze and Done work.',
          on: NOT_IOS,
        },
        {
          id: 'reminder-shade',
          title: 'Snooze and Done from the notification',
          how: 'From the notification shade, without opening the app: the task line changes.',
          on: ['android'],
        },
        {
          id: 'ios-hidden',
          title: 'Unbuilt iOS features are hidden',
          how: 'No Sync tab in Settings, no Reminders tab in Calendar, no “Remind at” on a task. Due dates still work.',
          on: IOS,
        },
        {
          id: 'event',
          title: 'Create and edit an event',
          how: 'It is Calendar/<day> <title>.md; changing the title renames it. Moving the start past the end moves the end.',
          on: ALL,
        },
        {
          id: 'week-phone',
          title: 'Week view on a phone',
          how: 'Opens on today; panning sideways keeps the hours in place. Opening an event does not raise the keyboard.',
          on: PHONES,
        },
      ],
    },
    {
      title: 'Capture',
      items: [
        {
          id: 'capture-thought',
          title: 'Capture a thought',
          how: 'Plain text saves to Thoughts with an undo. “/note Title” asks first, then creates and opens the note.',
          on: ALL,
        },
        {
          id: 'capture-tabbar',
          title: 'Capture from the tab bar',
          how: 'Opens with the keyboard up; the bar sits clear of the home indicator. Settings › Phone can swap a tab.',
          on: PHONES,
        },
        {
          id: 'capture-voice',
          title: 'Voice thought',
          how: 'The mic asks for permission once and records straight away; the recording sits beside its note in Thoughts/.',
          on: ALL,
        },
        {
          id: 'capture-transcribe',
          title: 'Transcription',
          how: 'Say “test message testing transcription”: that text, no repeated words. A second voice note works too.',
          on: ALL,
        },
        {
          id: 'capture-photo',
          title: 'Photo thought',
          how: 'Take photo opens the camera; the photo is saved and opens.',
          on: TOUCH,
        },
        {
          id: 'capture-hotkey',
          title: 'Capture hotkey and tray',
          how: 'The hotkey opens capture over another app; rebind it in Settings › Desktop; close to tray and reopen; launch at login.',
          on: DESKTOP,
        },
        {
          id: 'android-share',
          title: 'Share into Mentis',
          how: 'Share text, a link and a photo from another app; each arrives in Thoughts.',
          on: ['android'],
        },
        {
          id: 'android-widget',
          title: 'Widget and Quick Settings tile',
          how: 'Both open capture.',
          on: ['android'],
        },
      ],
    },
    {
      title: 'Files',
      items: [
        {
          id: 'pdf',
          title: 'PDF',
          how: 'Opens fitted to width; highlight, draw, a text box and a signature are still there after reopening. On a phone a finger pans and two fingers zoom.',
          on: ALL,
        },
        {
          id: 'canvas',
          title: 'Drawing',
          how: 'New drawing, a few strokes on two layers, undo, export PNG; reopen and it is the same.',
          on: ALL,
        },
        {
          id: 'pen',
          title: 'Pen',
          how: 'Pressure and taper, palm rejection on the canvas and in a PDF; the eraser end.',
          on: ['android', 'ipad', 'windows'],
        },
        {
          id: 'office',
          title: 'Word and PowerPoint',
          how: 'A .docx and a .pptx open for viewing.',
          on: ALL,
        },
        {
          id: 'kanban-mindmap',
          title: 'Board and mind map',
          how: 'New › Kanban and Mind map: create, move a card or node, reopen.',
          on: ALL,
        },
        {
          id: 'bookmark',
          title: 'Bookmark',
          how: 'Add a URL: the title and preview image appear (or it degrades cleanly).',
          on: ALL,
        },
      ],
    },
    {
      title: 'Sync',
      items: [
        {
          id: 'sync-connect',
          title: 'Connect Dropbox',
          how: 'Settings › Sync › Connect: sign in in the browser and come back to Mentis; the first sync starts.',
          on: NOT_IOS,
        },
        {
          id: 'sync-welcome',
          title: 'No conflict for a new vault’s Welcome.md',
          how: 'Connect a brand-new vault to a folder that already has Welcome.md: no “(conflict …)” copy.',
          on: NOT_IOS,
        },
        {
          id: 'sync-two-devices',
          title: 'Changes reach a second device',
          how: 'Edit, add and delete a note: the other device follows. A deleted note lands in _mentis/trash/<today>/.',
          on: NOT_IOS,
        },
        {
          id: 'sync-conflict',
          title: 'Conflict copy',
          how: 'Edit the same note on both devices between syncs: one keeps the newer text, “Note (conflict …).md” holds the other; one toast.',
          on: NOT_IOS,
        },
      ],
    },
    {
      title: 'AI (optional)',
      items: [
        {
          id: 'ai-off',
          title: 'Off by default',
          how: 'A new vault has no Chat anywhere: sidebar, tabs, palette, Ctrl+2, /chat.',
          on: ALL,
        },
        {
          id: 'ai-chat',
          title: 'A chat reply streams',
          how: 'Switch Chat on, add a provider key or Ollama on the LAN: the model list fills and an answer streams. iOS asks for local network access.',
          on: ALL,
        },
      ],
    },
    {
      title: 'Website only',
      items: [
        {
          id: 'web-offline',
          title: 'Works offline after a visit',
          how: 'Open a vault, go offline, reload: the app still opens it.',
          on: ['web'],
        },
        {
          id: 'web-pages',
          title: 'Privacy page and About',
          how: '/privacy opens; About links to the licence and admin@mentis.ink.',
          on: ['web'],
        },
      ],
    },
  ]

  const STORE = 'mentis-testing-v1'
  const LABEL = { pass: 'Pass', fail: 'Fail', skip: 'Skip' }

  /** @type {{ version: string, tester: string, platform: string, runs: Record<string, { device: string, results: Record<string, { s?: string, n?: string }> }> }} */
  let state = { version: '', tester: '', platform: 'web', runs: {} }
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null')
    if (saved && typeof saved === 'object') state = { ...state, ...saved }
  } catch {
    /* storage unavailable: start empty */
  }
  if (!PLATFORMS.some((p) => p.id === state.platform)) state.platform = 'web'

  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(state))
    } catch {
      /* not kept, still usable */
    }
  }

  const $ = (id) => document.getElementById(id)
  const el = (tag, props = {}, ...kids) => {
    const node = Object.assign(document.createElement(tag), props)
    for (const kid of kids) if (kid != null) node.append(kid)
    return node
  }

  const run = (platform = state.platform) => {
    if (!state.runs[platform]) state.runs[platform] = { device: '', results: {} }
    return state.runs[platform]
  }
  const sectionsFor = (platform) =>
    SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.on.includes(platform)) })).filter(
      (s) => s.items.length,
    )
  const tallyFor = (platform) => {
    const t = { pass: 0, fail: 0, skip: 0, total: 0 }
    const results = state.runs[platform]?.results || {}
    for (const s of sectionsFor(platform)) {
      for (const i of s.items) {
        t.total++
        const st = results[i.id]?.s
        if (st) t[st]++
      }
    }
    t.left = t.total - t.pass - t.fail - t.skip
    return t
  }
  const platformName = (id) => PLATFORMS.find((p) => p.id === id)?.name || id

  // ---- Rendering -----------------------------------------------------------

  function renderPlatforms() {
    const box = $('platforms')
    box.replaceChildren(
      ...PLATFORMS.map((p) => {
        const t = tallyFor(p.id)
        const done = t.total - t.left
        const btn = el(
          'button',
          { type: 'button' },
          p.name,
          done ? el('span', { className: 'count', textContent: `${done}/${t.total}` }) : null,
        )
        btn.setAttribute('aria-pressed', String(p.id === state.platform))
        btn.addEventListener('click', () => {
          state.platform = p.id
          save()
          render()
        })
        return btn
      }),
    )
  }

  function renderTally() {
    const t = tallyFor(state.platform)
    const seg = (n, color) =>
      el('span', { style: `width:${(n / t.total) * 100}%;background:var(--${color})` })
    $('progress').replaceChildren(seg(t.pass, 'pass'), seg(t.fail, 'fail'), seg(t.skip, 'skip'))
    $('tally').textContent = `${t.pass} pass · ${t.fail} fail · ${t.skip} skip · ${t.left} to go`
  }

  function renderItem(item) {
    const r = run()
    const result = r.results[item.id] || {}
    const li = el('li', { className: 'item' })
    if (result.s) li.dataset.s = result.s

    const status = el('div', { className: 'status', role: 'group' })
    status.setAttribute('aria-label', `Result for ${item.title}`)
    for (const v of ['pass', 'fail', 'skip']) {
      const b = el('button', { type: 'button', textContent: LABEL[v] })
      b.dataset.v = v
      b.setAttribute('aria-pressed', String(result.s === v))
      b.addEventListener('click', () => {
        const cur = (r.results[item.id] ||= {})
        cur.s = cur.s === v ? undefined : v
        if (!cur.s && !cur.n) delete r.results[item.id]
        save()
        if (cur.s) li.dataset.s = cur.s
        else delete li.dataset.s
        for (const other of status.children)
          other.setAttribute('aria-pressed', String(other.dataset.v === cur.s))
        renderTally()
        renderPlatforms()
      })
      status.append(b)
    }

    const note = el('textarea', {
      placeholder: 'Note',
      value: result.n || '',
      rows: 1,
    })
    note.setAttribute('aria-label', `Note for ${item.title}`)
    note.addEventListener('input', () => {
      const cur = (r.results[item.id] ||= {})
      cur.n = note.value
      if (!cur.s && !cur.n) delete r.results[item.id]
      save()
    })

    li.append(
      el(
        'div',
        { className: 'head' },
        el(
          'div',
          {},
          el('div', { className: 'title', textContent: item.title }),
          el('p', { className: 'how', textContent: item.how }),
        ),
        status,
      ),
      note,
    )
    return li
  }

  function renderSections() {
    $('sections').replaceChildren(
      ...sectionsFor(state.platform).map((s) =>
        el(
          'section',
          {},
          el('h2', { textContent: s.title }),
          el('ul', { className: 'items' }, ...s.items.map(renderItem)),
        ),
      ),
    )
  }

  function render() {
    $('device').value = run().device || ''
    renderPlatforms()
    renderTally()
    renderSections()
  }

  // ---- Report --------------------------------------------------------------

  const testedPlatforms = () =>
    PLATFORMS.map((p) => p.id).filter((id) => {
      const t = tallyFor(id)
      return t.total - t.left > 0
    })

  function buildReport() {
    const platforms = testedPlatforms()
    const list = platforms.length ? platforms : [state.platform]
    const date = new Date().toLocaleDateString(undefined, { dateStyle: 'long' })
    const box = $('report')
    const parts = [
      el('h1', { textContent: `Mentis ${state.version || ''} test report`.replace('  ', ' ') }),
      el(
        'dl',
        {},
        el('dt', { textContent: 'Date' }),
        el('dd', { textContent: date }),
        el('dt', { textContent: 'Tester' }),
        el('dd', { textContent: state.tester || '—' }),
      ),
    ]
    for (const id of list) {
      const t = tallyFor(id)
      const results = state.runs[id]?.results || {}
      parts.push(
        el('h2', {
          textContent: `${platformName(id)}${state.runs[id]?.device ? ` — ${state.runs[id].device}` : ''}: ${t.pass} pass, ${t.fail} fail, ${t.skip} skip, ${t.left} not run`,
        }),
      )
      const rows = []
      for (const s of sectionsFor(id)) {
        rows.push(el('tr', {}, el('th', { colSpan: 2, textContent: s.title })))
        for (const i of s.items) {
          const r = results[i.id] || {}
          const st = r.s || 'none'
          rows.push(
            el(
              'tr',
              {},
              el('td', { className: `st ${st}`, textContent: r.s ? LABEL[r.s] : '—' }),
              el(
                'td',
                {},
                i.title,
                r.n ? el('div', { className: 'note', textContent: r.n }) : null,
              ),
            ),
          )
        }
      }
      parts.push(el('table', {}, el('tbody', {}, ...rows)))
    }
    box.replaceChildren(...parts)
  }

  function summaryText() {
    const platforms = testedPlatforms()
    const list = platforms.length ? platforms : [state.platform]
    const lines = [
      `Mentis ${state.version || '(version not set)'} test report`,
      `${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}${state.tester ? ` · ${state.tester}` : ''}`,
      '',
    ]
    for (const id of list) {
      const t = tallyFor(id)
      const results = state.runs[id]?.results || {}
      const device = state.runs[id]?.device
      lines.push(
        `${platformName(id)}${device ? ` (${device})` : ''}: ${t.pass} pass, ${t.fail} fail, ${t.skip} skip, ${t.left} not run`,
      )
      for (const s of sectionsFor(id)) {
        for (const i of s.items) {
          const r = results[i.id]
          if (!r) continue
          if (r.s === 'fail' || r.n) {
            lines.push(
              `  ${r.s ? LABEL[r.s].toUpperCase() : 'NOTE'} ${i.title}${r.n ? `: ${r.n}` : ''}`,
            )
          }
        }
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  // ---- Wiring --------------------------------------------------------------

  $('version').value = state.version
  $('tester').value = state.tester
  $('version').addEventListener('input', (e) => {
    state.version = e.target.value.trim()
    save()
  })
  $('tester').addEventListener('input', (e) => {
    state.tester = e.target.value
    save()
  })
  $('device').addEventListener('input', (e) => {
    run().device = e.target.value
    save()
  })

  window.addEventListener('beforeprint', buildReport)
  $('pdf').addEventListener('click', () => {
    buildReport()
    const title = document.title
    document.title = `Mentis ${state.version || ''} test report`.trim()
    window.print()
    document.title = title
  })

  $('email').addEventListener('click', () => {
    const subject = `Mentis ${state.version || ''} test report`.replace(/\s+/g, ' ').trim()
    let body = summaryText()
    // Mail apps cut long links short; the PDF carries the full detail.
    if (body.length > 1800) body = `${body.slice(0, 1800)}\n…\n(Full report in the attached PDF.)`
    body += '\n\nPDF attached.'
    location.href = `mailto:admin@mentis.ink?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  })

  $('copy').addEventListener('click', async (e) => {
    const btn = e.currentTarget
    try {
      await navigator.clipboard.writeText(summaryText())
      btn.textContent = 'Copied'
    } catch {
      btn.textContent = 'Copy failed'
    }
    setTimeout(() => (btn.textContent = 'Copy summary'), 1500)
  })

  $('reset').addEventListener('click', () => {
    if (!confirm(`Clear every result for ${platformName(state.platform)}?`)) return
    delete state.runs[state.platform]
    save()
    render()
  })

  render()
})()
