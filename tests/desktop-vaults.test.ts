// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The desktop vault flow against a stand-in shell: the vault_* file commands
 * work on an in-memory folder, and the dialog/recent commands answer as the
 * test sets them up.
 */
const files = new Map<string, Uint8Array>()
const dirs = new Set<string>()
const shell = {
  picked: null as string | null,
  recent: [] as string[],
  calls: [] as string[],
}

const key = (root: string, path: string) => (path ? `${root}/${path}` : root)

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(
    async (cmd: string, args: unknown, options?: { headers?: Record<string, string> }) => {
      shell.calls.push(cmd)
      const a = (args ?? {}) as Record<string, string>
      switch (cmd) {
        case 'vault_pick_folder':
        case 'vault_create': {
          if (!shell.picked) return null
          const root = cmd === 'vault_create' ? `${shell.picked}/${a.name}` : shell.picked
          dirs.add(root)
          shell.recent.unshift(root)
          return root
        }
        case 'vault_open_recent':
          if (!shell.recent.includes(a.path) || !dirs.has(a.path)) throw 'not available'
          return a.path
        case 'vault_recent':
          return shell.recent.map((path) => ({ path, name: path, available: dirs.has(path) }))
        case 'vault_exists':
          return dirs.has(key(a.root, a.path)) || files.has(key(a.root, a.path))
        case 'vault_mkdir':
          dirs.add(key(a.root, a.path))
          return null
        case 'vault_write': {
          const h = options!.headers!
          files.set(
            key(decodeURIComponent(h['x-vault-root']), decodeURIComponent(h['x-vault-path'])),
            new Uint8Array(args as Uint8Array),
          )
          return null
        }
        case 'vault_read': {
          const f = files.get(key(a.root, a.path))
          if (!f) throw 'not found'
          return f.slice().buffer
        }
        case 'vault_read_dir':
          return []
      }
      throw new Error(`unexpected ${cmd}`)
    },
  ),
}))

const session = await import('@/lib/vault/session')
const ACTIVE = 'mentis:active-vault-path'

describe('desktop vaults', () => {
  beforeEach(() => {
    files.clear()
    dirs.clear()
    shell.picked = null
    shell.recent = []
    shell.calls = []
    localStorage.clear()
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  })
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  it('knows it is the desktop app', () => {
    expect(session.isDesktop()).toBe(true)
    expect(session.canOpenFolder()).toBe(true)
  })

  it('opening a plain folder makes it a vault named after the folder', async () => {
    shell.picked = 'C:/Users/me/Research'
    const s = await session.openFolderVault()
    expect(s?.vaultPath).toBe('tauri:C:/Users/me/Research')
    expect(s?.vaultFs.type).toBe('tauri')
    expect(s?.config.name).toBe('Research')
    expect(dirs.has('C:/Users/me/Research/_mentis')).toBe(true)
    expect(localStorage.getItem(ACTIVE)).toBe('tauri:C:/Users/me/Research')
  })

  it('creating a vault uses the given name and the chosen location', async () => {
    shell.picked = 'D:/Vaults'
    const s = await session.createDesktopVault('  Work notes ')
    expect(s?.vaultPath).toBe('tauri:D:/Vaults/Work notes')
    expect(s?.config.name).toBe('Work notes')
  })

  it('cancelling the dialog opens nothing', async () => {
    expect(await session.openFolderVault()).toBeNull()
    expect(await session.createDesktopVault('X')).toBeNull()
    expect(localStorage.getItem(ACTIVE)).toBeNull()
  })

  it('reopens the last vault at launch without a dialog', async () => {
    shell.picked = 'C:/V'
    await session.openFolderVault()
    shell.calls = []

    const restored = await session.restoreLastVault()
    expect(restored.status).toBe('opened')
    expect(shell.calls).toContain('vault_open_recent')
    expect(shell.calls).not.toContain('vault_pick_folder')
  })

  it('forgets the last vault when its folder is gone', async () => {
    localStorage.setItem(ACTIVE, 'tauri:C:/Gone')
    expect((await session.restoreLastVault()).status).toBe('none')
    expect(localStorage.getItem(ACTIVE)).toBeNull()
  })

  it('ignores a stored browser vault id', async () => {
    localStorage.setItem(ACTIVE, 'vaults/my-vault')
    expect((await session.restoreLastVault()).status).toBe('none')
    expect(shell.calls).toEqual([])
  })
})
