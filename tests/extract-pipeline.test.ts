import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs'
import type { ExtractRequest, ExtractRunner } from '@/core/index/extract'
import type { IndexDocument } from '@/core/index/protocol'
import { fileTypes } from '@/core/registries'
import { extractorTypeIds, runExtractor } from '@/core/index/extract'

const indexed: IndexDocument[] = []
const removed: string[][] = []

vi.mock('@/lib/search/index', () => ({
  getIndexManifest: vi.fn(async () => []),
  removeSearchDocuments: vi.fn(async (paths: string[]) => {
    removed.push(paths)
  }),
  upsertSearchDocument: vi.fn(async (doc: IndexDocument) => {
    indexed.push(doc)
  }),
  upsertSearchDocuments: vi.fn(async (docs: IndexDocument[]) => {
    indexed.push(...docs)
  }),
}))

// Imported after the mock so the pipeline binds to it.
const { reconcileVaultSearchIndex, reindexFilePath } =
  await import('@/lib/search/build-vault-index')

function fakeFs(files: Record<string, string | Uint8Array>): FileSystemAdapter {
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  return {
    readdir: async (dir: string) =>
      Object.entries(files)
        .filter(([p]) => (dir === '' ? !p.includes('/') : p.startsWith(dir + '/')))
        .map(([p, v]) => ({
          name: p.split('/').pop()!,
          path: p,
          isDirectory: false,
          size: typeof v === 'string' ? v.length : v.length,
          modifiedAt: new Date(1_700_000_000_000).toISOString(),
        })),
    readTextFile: async (p: string) => {
      const v = files[p]
      if (v === undefined) throw new Error('ENOENT')
      return typeof v === 'string' ? v : dec.decode(v)
    },
    readFile: async (p: string) => {
      const v = files[p]
      if (v === undefined) throw new Error('ENOENT')
      return typeof v === 'string' ? enc.encode(v) : v
    },
    stat: async (p: string) => ({
      size: 1,
      modifiedAt: new Date(1_700_000_000_000),
      isDirectory: false,
      path: p,
    }),
  } as unknown as FileSystemAdapter
}

const echo: ExtractRunner = async ({ path, data }) => ({
  content: typeof data === 'string' ? data : `bytes:${data.length}`,
  title: `T:${path}`,
})

beforeEach(() => {
  indexed.length = 0
  removed.length = 0
})

describe('reconcileVaultSearchIndex with an injected runner', () => {
  it('reads text types as strings and binary types as bytes', async () => {
    const seen: ExtractRequest[] = []
    const run: ExtractRunner = async (req) => {
      seen.push(req)
      return { content: 'x' }
    }
    const fs = fakeFs({ 'a.md': '# a', 'b.xlsx': new Uint8Array([1, 2, 3]) })
    await reconcileVaultSearchIndex(fs, () => false, run)

    const md = seen.find((r) => r.path === 'a.md')!
    const xlsx = seen.find((r) => r.path === 'b.xlsx')!
    expect(md.typeId).toBe('markdown')
    expect(typeof md.data).toBe('string')
    expect(xlsx.typeId).toBe('spreadsheet')
    expect(xlsx.data).toBeInstanceOf(Uint8Array)
  })

  it('indexes every file, in batches, once each', async () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 60; i++) files[`n${i}.md`] = `note ${i}`
    const result = await reconcileVaultSearchIndex(fakeFs(files), () => false, echo)

    expect(result.indexed).toBe(60)
    expect(indexed.map((d) => d.path).sort()).toEqual(Object.keys(files).sort())
    expect(new Set(indexed.map((d) => d.path)).size).toBe(60)
  })

  it('runs several extractions at once but never more than three', async () => {
    let active = 0
    let peak = 0
    const run: ExtractRunner = async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return { content: '' }
    }
    const files: Record<string, string> = {}
    for (let i = 0; i < 12; i++) files[`n${i}.md`] = 'x'
    await reconcileVaultSearchIndex(fakeFs(files), () => false, run)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('indexes a file by title only when its extractor throws', async () => {
    const run: ExtractRunner = async () => {
      throw new Error('corrupt')
    }
    const result = await reconcileVaultSearchIndex(
      fakeFs({ 'broken.pdf': new Uint8Array(4) }),
      () => false,
      run,
    )
    expect(result.indexed).toBe(1)
    expect(indexed[0]).toMatchObject({ path: 'broken.pdf', title: 'broken', content: '' })
  })

  it('skips a document when the extractor returns null', async () => {
    const run: ExtractRunner = async () => null
    const result = await reconcileVaultSearchIndex(fakeFs({ 'x.md': 'hi' }), () => false, run)
    expect(result.indexed).toBe(0)
    expect(indexed).toHaveLength(0)
  })

  it('indexes drawings by title without running an extractor', async () => {
    const run = vi.fn(echo)
    await reconcileVaultSearchIndex(fakeFs({ 'sketch.canvas': '{}' }), () => false, run)
    expect(run).not.toHaveBeenCalled()
    expect(indexed[0]).toMatchObject({ path: 'sketch.canvas', content: '' })
  })

  it('stops writing once cancelled', async () => {
    let cancelled = false
    const run: ExtractRunner = async (req) => {
      cancelled = true
      return echo(req)
    }
    const files: Record<string, string> = {}
    for (let i = 0; i < 40; i++) files[`n${i}.md`] = 'x'
    const result = await reconcileVaultSearchIndex(fakeFs(files), () => cancelled, run)
    expect(indexed).toHaveLength(0)
    expect(result.indexed).toBe(0)
  })
})

describe('reindexFilePath', () => {
  it('extracts one file and upserts it', async () => {
    await reindexFilePath(fakeFs({ 'a.md': 'hello' }), 'a.md', echo)
    expect(indexed).toHaveLength(1)
    expect(indexed[0]).toMatchObject({ path: 'a.md', type: 'markdown', content: 'hello' })
  })
})

describe('extractor discovery', () => {
  it('has a modules/<id>/search.ts for every type that reads content', () => {
    const ids = new Set(extractorTypeIds())
    const needing = fileTypes
      .all()
      .filter((d) => d.search?.read)
      .map((d) => d.id)
    expect(needing.length).toBeGreaterThan(0)
    for (const id of needing) expect(ids.has(id), `missing extractor for ${id}`).toBe(true)
  })

  it('runs a real extractor by type id', async () => {
    const out = await runExtractor({
      typeId: 'markdown',
      path: 'n.md',
      data: '---\ntags: [alpha]\n---\n# Heading\nbody text',
    })
    expect(out?.content).toContain('body text')
    expect(out?.tags).toContain('alpha')
  })

  it('rejects an unknown type id', async () => {
    await expect(runExtractor({ typeId: 'nope', path: 'x', data: '' })).rejects.toThrow(/nope/)
  })
})
