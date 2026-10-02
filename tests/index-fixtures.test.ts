import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { IndexStore } from '@/core/index/store'

/**
 * Shared behaviour fixtures. The same JSON files in tests/fixtures/index run
 * here against the sqlite-wasm store and in src-tauri/tests/index_fixtures.rs
 * against the native one, so both must return the same results in the same
 * order. Scores are left out (the two engines' ranking formulas can differ in
 * the last digits); everything else is compared exactly.
 *
 * A step is `{ op, arg, expect? }`. With `expect` the result is compared; a
 * placeholder `"?"` is filled in from this implementation when the tests run
 * with UPDATE_FIXTURES=1, after which the diff should be read like any other.
 */
const DIR = join(__dirname, 'fixtures', 'index')

interface Step {
  op: string
  arg?: Record<string, unknown>
  expect?: unknown
}
interface Fixture {
  name: string
  steps: Step[]
}

/** JSON with object keys sorted, so the same value always sorts the same way. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/** The result as the fixtures record it: scores dropped, unordered lists sorted. */
function normalize(op: string, result: unknown): unknown {
  if ((op === 'search' || op === 'searchPassages') && Array.isArray(result)) {
    return result.map(({ score: _score, ...rest }) => rest)
  }
  if ((op === 'manifest' || op === 'links' || op === 'children') && Array.isArray(result)) {
    return [...result].sort((a, b) => {
      const x = canon(a)
      const y = canon(b)
      return x < y ? -1 : x > y ? 1 : 0
    })
  }
  return result === undefined ? null : result
}

function run(store: IndexStore, { op, arg = {} }: Step): unknown {
  switch (op) {
    case 'upsert':
      return store.upsert(arg.docs as never)
    case 'remove':
      return store.remove(arg.paths as string[])
    case 'search':
      return store.search(arg.query as string, arg.filters as never)
    case 'searchPassages':
      return store.searchPassages(arg.query as string, arg.limit as number)
    case 'manifest':
      return store.manifest()
    case 'links':
      return store.links()
    case 'validHashes':
      return store.validHashes(arg.files as never)
    case 'putHashes':
      return store.putHashes(arg.hashes as never)
    case 'children':
      return store.children(arg.dir as string)
    case 'setChildren':
      return store.setChildren(arg.listings as never)
  }
  throw new Error(`unknown op ${op}`)
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
let sqlite3: Sqlite3Static

describe('shared index fixtures', () => {
  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule()
  })

  it('has fixtures', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const fixture = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Fixture
    it(`${file}: ${fixture.name}`, () => {
      const store = new IndexStore(new sqlite3.oo1.DB(':memory:'))
      let changed = false
      fixture.steps.forEach((step, n) => {
        const got = normalize(step.op, run(store, step))
        if (!('expect' in step)) return
        if (step.expect === '?' && process.env.UPDATE_FIXTURES) {
          step.expect = got
          changed = true
          return
        }
        expect(got, `${file} step ${n + 1} (${step.op})`).toEqual(step.expect)
      })
      if (changed) writeFileSync(join(DIR, file), JSON.stringify(fixture, null, 2) + '\n')
    })
  }
})
