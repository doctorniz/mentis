import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Drives TauriFsAdapter against a stand-in for the shell's `vault_*` commands:
 * an in-memory folder that answers the same calls with the same shapes.
 */
const files = new Map<string, Uint8Array>()
const dirs = new Set<string>([''])
const calls: Array<{ cmd: string; args: unknown; headers?: Record<string, string> }> = []

const parent = (p: string) => p.split('/').slice(0, -1).join('/')
const name = (p: string) => p.split('/').pop()!

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(
    async (cmd: string, args: unknown, options?: { headers?: Record<string, string> }) => {
      calls.push({ cmd, args, headers: options?.headers })
      const a = args as { root: string; path: string; from: string; to: string }
      switch (cmd) {
        case 'vault_read': {
          const f = files.get(a.path)
          if (!f) throw 'not found'
          return f.slice().buffer
        }
        case 'vault_write': {
          const path = decodeURIComponent(options!.headers!['x-vault-path'])
          files.set(path, new Uint8Array(args as Uint8Array))
          return null
        }
        case 'vault_exists':
          return files.has(a.path) || dirs.has(a.path)
        case 'vault_stat': {
          const f = files.get(a.path)
          if (!f) throw 'not found'
          return { size: f.length, isDirectory: false, mtime: 2000, birthtime: 1000 }
        }
        case 'vault_mkdir':
          dirs.add(a.path)
          return null
        case 'vault_read_dir': {
          const out = []
          for (const d of dirs)
            if (d && parent(d) === a.path)
              out.push({ name: name(d), size: 0, isDirectory: true, mtime: 5, birthtime: 1 })
          for (const [p, f] of files)
            if (parent(p) === a.path)
              out.push({
                name: name(p),
                size: f.length,
                isDirectory: false,
                mtime: 5,
                birthtime: 1,
              })
          return out
        }
        case 'vault_rename':
        case 'vault_copy': {
          const f = files.get(a.from)!
          files.set(a.to, f)
          if (cmd === 'vault_rename') files.delete(a.from)
          return null
        }
        case 'vault_remove':
          files.delete(a.path)
          return null
        case 'vault_remove_dir':
          for (const p of [...files.keys()]) if (p.startsWith(`${a.path}/`)) files.delete(p)
          dirs.delete(a.path)
          return null
      }
      throw new Error(`unexpected ${cmd}`)
    },
  ),
}))

const { TauriFsAdapter } = await import('@/lib/fs/tauri')
const ROOT = 'C:/Users/me/My Vault'

describe('TauriFsAdapter', () => {
  beforeEach(() => {
    files.clear()
    dirs.clear()
    dirs.add('')
    calls.length = 0
  })

  it('round-trips text and bytes, sending bytes raw with the path in headers', async () => {
    const fs = new TauriFsAdapter(ROOT)
    await fs.writeTextFile('notes/ünïcode ✓.md', '# Héllo')
    expect(await fs.readTextFile('notes/ünïcode ✓.md')).toBe('# Héllo')

    const write = calls.find((c) => c.cmd === 'vault_write')!
    expect(write.args).toBeInstanceOf(Uint8Array)
    expect(decodeURIComponent(write.headers!['x-vault-root'])).toBe(ROOT)
    expect(decodeURIComponent(write.headers!['x-vault-path'])).toBe('notes/ünïcode ✓.md')

    await fs.writeFile('_assets/a.bin', new Uint8Array([0, 255, 7]))
    expect([...(await fs.readFile('_assets/a.bin'))]).toEqual([0, 255, 7])
  })

  it('writes only the viewed bytes of a sub-array', async () => {
    const fs = new TauriFsAdapter(ROOT)
    const backing = new Uint8Array([9, 9, 1, 2, 9])
    await fs.writeFile('x.bin', backing.subarray(2, 4))
    expect([...(await fs.readFile('x.bin'))]).toEqual([1, 2])
  })

  it('lists a folder in one call: folders first, then files by name, with paths and metadata', async () => {
    const fs = new TauriFsAdapter(ROOT)
    await fs.mkdir('notes')
    await fs.mkdir('notes/zeta')
    await fs.writeTextFile('notes/b.md', 'bb')
    await fs.writeTextFile('notes/a.canvas', '{}')
    calls.length = 0

    const entries = await fs.readdir('notes')
    expect(calls.map((c) => c.cmd)).toEqual(['vault_read_dir'])
    expect(entries.map((e) => e.path)).toEqual(['notes/zeta', 'notes/a.canvas', 'notes/b.md'])
    expect(entries[0]).toMatchObject({ isDirectory: true, type: 'other' })
    expect(entries[2]).toMatchObject({ isDirectory: false, size: 2, type: 'markdown' })
    expect(entries[2].modifiedAt).toBe(new Date(5).toISOString())

    const top = await fs.readdir('')
    expect(top.map((e) => e.path)).toEqual(['notes'])
  })

  it('stats, renames, copies and removes', async () => {
    const fs = new TauriFsAdapter(ROOT)
    await fs.writeTextFile('a.md', 'abc')
    expect(await fs.stat('a.md')).toEqual({
      size: 3,
      createdAt: new Date(1000),
      modifiedAt: new Date(2000),
    })

    await fs.rename('a.md', 'b.md')
    expect(await fs.exists('a.md')).toBe(false)
    await fs.copy('b.md', 'c.md')
    expect(await fs.readTextFile('c.md')).toBe('abc')
    await fs.remove('b.md')
    expect(await fs.exists('b.md')).toBe(false)

    await fs.mkdir('d')
    await fs.writeTextFile('d/x.md', 'x')
    await fs.removeDir('d')
    expect(await fs.exists('d/x.md')).toBe(false)
  })

  it('makes no call when renaming a path to itself', async () => {
    const fs = new TauriFsAdapter(ROOT)
    await fs.rename('same.md', 'same.md')
    expect(calls).toEqual([])
  })

  it('init fails when the folder is gone', async () => {
    dirs.clear()
    await expect(new TauriFsAdapter(ROOT).init()).rejects.toThrow(/not available/)
  })
})
