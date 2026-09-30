import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry, FileStats } from '@/types/files'
import { FileType } from '@/types/files'

/** In-memory folder tree standing in for both OPFS and a picked disk folder. */
class MemFs implements FileSystemAdapter {
  readonly type = 'opfs' as const
  files = new Map<string, Uint8Array>()
  dirs = new Set<string>([''])

  async init() {}
  async readFile(path: string) {
    const d = this.files.get(path)
    if (!d) throw new Error(`Not found: ${path}`)
    return d
  }
  async readTextFile(path: string) {
    return new TextDecoder().decode(await this.readFile(path))
  }
  async writeFile(path: string, data: Uint8Array) {
    this.files.set(path, data)
  }
  async writeTextFile(path: string, content: string) {
    await this.writeFile(path, new TextEncoder().encode(content))
  }
  async exists(path: string) {
    return this.files.has(path) || this.dirs.has(path)
  }
  async stat(): Promise<FileStats> {
    return { size: 0, createdAt: new Date(), modifiedAt: new Date() }
  }
  async mkdir(path: string) {
    this.dirs.add(path)
  }
  async readdir(path: string): Promise<FileEntry[]> {
    const prefix = path ? path + '/' : ''
    const out = new Map<string, FileEntry>()
    for (const p of [...this.files.keys(), ...this.dirs]) {
      if (!p.startsWith(prefix) || p === path) continue
      const rest = p.slice(prefix.length)
      const first = rest.split('/')[0]
      const isDirectory = this.dirs.has(prefix + first)
      out.set(first, {
        name: first,
        path: prefix + first,
        isDirectory,
        type: FileType.Other,
      })
    }
    return [...out.values()]
  }
  async rename() {}
  async copy() {}
  async remove(path: string) {
    this.files.delete(path)
  }
  async removeDir() {}
}

/* ---- module doubles ---- */

const state = vi.hoisted(() => ({
  active: null as string | null,
  handle: null as unknown,
  folderFs: null as unknown,
  picker: null as (() => Promise<unknown>) | null,
  fsapiSupported: true,
  root: null as unknown,
}))

vi.mock('@/lib/vault/session-storage', () => ({
  getStoredActiveVaultPath: () => state.active,
  setStoredActiveVaultPath: (p: string | null) => {
    state.active = p
  },
}))

vi.mock('@/lib/fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/fs')>()
  class FakeFsapiAdapter {
    readonly type = 'fsapi' as const
    constructor(readonly directoryHandle: { name: string }) {
      const fs = state.folderFs as MemFs
      return Object.assign(fs, { directoryHandle, type: 'fsapi' as const }) as never
    }
  }
  return {
    ...original,
    getFileSystemAdapter: async () => state.root,
    FsapiAdapter: FakeFsapiAdapter,
    isFsapiSupported: () => state.fsapiSupported,
    pickDirectoryFsapi: () => state.picker!(),
    storeDirectoryHandle: async (h: unknown) => {
      state.handle = h
    },
    getStoredDirectoryHandle: async () => state.handle,
    clearStoredDirectoryHandle: async () => {
      state.handle = null
    },
  }
})

import {
  createBrowserVault,
  forgetLastVault,
  listBrowserVaults,
  openBrowserVault,
  openFolderVault,
  restoreLastVault,
} from '@/lib/vault/session'
import { MENTIS_DIR } from '@/types/vault'

function fakeHandle(name: string, permission: 'granted' | 'prompt' | 'denied') {
  return {
    name,
    queryPermission: async () => permission,
    requestPermission: async () => permission,
  }
}

let root: MemFs

beforeEach(() => {
  root = new MemFs()
  state.root = root
  state.active = null
  state.handle = null
  state.folderFs = new MemFs()
  state.picker = null
  state.fsapiSupported = true
})

describe('browser vaults', () => {
  it('creates a vault, records it as the active one, and lists it', async () => {
    const session = await createBrowserVault('  Field Notes ')
    expect(session.rootFs).toBe(root)
    expect(session.config.name).toBe('Field Notes')
    expect(session.vaultPath).toMatch(/^vaults\//)
    expect(state.active).toBe(session.vaultPath)
    expect(await session.vaultFs.exists(MENTIS_DIR)).toBe(true)

    expect(await listBrowserVaults()).toEqual([
      { path: session.vaultPath, displayName: 'Field Notes' },
    ])
  })

  it('names a vault "My Vault" when the name is blank', async () => {
    expect((await createBrowserVault('   ')).config.name).toBe('My Vault')
  })

  it('opens an existing vault and records it as active', async () => {
    const { vaultPath } = await createBrowserVault('One')
    state.active = null
    const session = await openBrowserVault(vaultPath)
    expect(session.vaultPath).toBe(vaultPath)
    expect(session.config.name).toBe('One')
    expect(state.active).toBe(vaultPath)
  })

  it('refuses a folder that is not a vault, and does not record it', async () => {
    root.dirs.add('vaults/plain')
    await expect(openBrowserVault('vaults/plain')).rejects.toThrow(
      'That folder is not a valid Mentis vault.',
    )
    expect(state.active).toBeNull()
  })
})

describe('restoreLastVault', () => {
  it('reopens the last browser vault', async () => {
    const { vaultPath } = await createBrowserVault('Again')
    const restored = await restoreLastVault()
    expect(restored.status).toBe('opened')
    if (restored.status === 'opened') expect(restored.session.vaultPath).toBe(vaultPath)
  })

  it('does nothing when no vault was open', async () => {
    expect(await restoreLastVault()).toEqual({ status: 'none' })
  })

  it('forgets a record whose vault no longer exists', async () => {
    state.active = 'vaults/deleted-abc'
    expect(await restoreLastVault()).toEqual({ status: 'none' })
    expect(state.active).toBeNull()
  })

  it('opens nothing once aborted', async () => {
    await createBrowserVault('Aborted')
    const abort = new AbortController()
    abort.abort()
    expect(await restoreLastVault(abort.signal)).toEqual({ status: 'none' })
  })
})

describe('folder vaults', () => {
  it('turns a picked folder into a vault, remembering its handle', async () => {
    const handle = fakeHandle('Documents', 'granted')
    state.picker = async () => new (await import('@/lib/fs')).FsapiAdapter(handle as never)
    const session = await openFolderVault()
    expect(session?.vaultPath).toBe('fsapi:Documents')
    expect(session?.rootFs).toBe(session?.vaultFs)
    expect(state.active).toBe('fsapi:Documents')
    expect(state.handle).toBe(handle)
    expect(await (state.folderFs as MemFs).exists(MENTIS_DIR)).toBe(true)
  })

  it('opens a folder that is already a vault without recreating it', async () => {
    const folder = state.folderFs as MemFs
    folder.dirs.add(MENTIS_DIR)
    await folder.writeTextFile(`${MENTIS_DIR}/config.json`, JSON.stringify({ name: 'Existing' }))
    state.picker = async () =>
      new (await import('@/lib/fs')).FsapiAdapter(fakeHandle('Existing', 'granted') as never)
    expect((await openFolderVault())?.config.name).toBe('Existing')
  })

  it('returns null, and records nothing, when the picker is cancelled', async () => {
    state.picker = async () => {
      throw new DOMException('cancelled', 'AbortError')
    }
    expect(await openFolderVault()).toBeNull()
    expect(state.active).toBeNull()
  })

  it('passes other picker errors on', async () => {
    state.picker = async () => {
      throw new Error('Read/write permission denied for the selected folder.')
    }
    await expect(openFolderVault()).rejects.toThrow('permission denied')
  })

  it('restores a folder whose permission is still granted', async () => {
    state.active = 'fsapi:Documents'
    state.handle = fakeHandle('Documents', 'granted')
    const restored = await restoreLastVault()
    expect(restored.status).toBe('opened')
    if (restored.status === 'opened') expect(restored.session.vaultPath).toBe('fsapi:Documents')
  })

  it('asks to reconnect when the browser wants permission again', async () => {
    state.active = 'fsapi:Documents'
    state.handle = fakeHandle('Documents', 'prompt')
    const restored = await restoreLastVault()
    expect(restored.status).toBe('needs-permission')
    if (restored.status !== 'needs-permission') return
    expect(restored.folderName).toBe('Documents')
    expect(state.active).toBe('fsapi:Documents')

    const session = await restored.reconnect()
    expect(session.vaultPath).toBe('fsapi:Documents')
  })

  it('forgets the folder when reconnecting fails', async () => {
    state.active = 'fsapi:Documents'
    state.handle = fakeHandle('Documents', 'prompt')
    const restored = await restoreLastVault()
    if (restored.status !== 'needs-permission') throw new Error('expected a permission prompt')
    ;(state.folderFs as MemFs).init = async () => {
      throw new Error('Read/write permission denied for the selected folder.')
    }
    await expect(restored.reconnect()).rejects.toThrow('permission denied')
    expect(state.active).toBeNull()
    expect(state.handle).toBeNull()
  })

  it('forgets a folder whose permission was revoked', async () => {
    state.active = 'fsapi:Documents'
    state.handle = fakeHandle('Documents', 'denied')
    expect(await restoreLastVault()).toEqual({ status: 'none' })
    expect(state.active).toBeNull()
    expect(state.handle).toBeNull()
  })

  it('does not try a folder where the browser cannot open folders', async () => {
    state.fsapiSupported = false
    state.active = 'fsapi:Documents'
    state.handle = fakeHandle('Documents', 'granted')
    expect(await restoreLastVault()).toEqual({ status: 'none' })
  })
})

describe('forgetLastVault', () => {
  it('clears both the active vault and the saved folder handle', async () => {
    state.active = 'fsapi:Documents'
    state.handle = fakeHandle('Documents', 'granted')
    await forgetLastVault()
    expect(state.active).toBeNull()
    expect(state.handle).toBeNull()
  })
})
