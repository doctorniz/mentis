import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

const tauri: string = json('src-tauri/tauri.conf.json').app.security.csp
const vercel: string = json('vercel.json').headers[0].headers[0].value
const e2e: string = json('tests/e2e/serve.json').headers[0].headers[0].value

const directives = (csp: string) =>
  Object.fromEntries(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([name, ...sources]) => [name, sources]),
  )

describe('content security policy', () => {
  it('is the same for the apps, the website and the e2e server', () => {
    // frame-ancestors only works as a header, so the apps leave it out.
    expect(vercel).toBe(`${tauri}; frame-ancestors 'none'`)
    expect(e2e).toBe(vercel)
  })

  it('never lets script run from inline markup or eval', () => {
    const scripts = directives(tauri)['script-src']
    expect(scripts).not.toContain("'unsafe-inline'")
    expect(scripts).not.toContain("'unsafe-eval'")
    expect(directives(tauri)['object-src']).toEqual(["'none'"])
  })
})
