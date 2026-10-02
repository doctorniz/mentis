import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
const unlisten = vi.fn()
let handler: (() => void) | undefined
const listen = vi.fn(async (_event: string, cb: () => void) => {
  handler = cb
  return unlisten
})
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: (...a: [string, () => void]) => listen(...a),
}))

import { watchDesktopVault } from '@/lib/vault/watch'

describe('watchDesktopVault', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(null)
    unlisten.mockReset()
    listen.mockClear()
    handler = undefined
  })

  it('does nothing for a vault that is not a folder on disk', async () => {
    expect(await watchDesktopVault('vault-1234', vi.fn())).toBeNull()
    expect(listen).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('listens, then asks the shell to watch the folder', async () => {
    const stop = await watchDesktopVault('tauri:C:\Users\me\Notes', vi.fn())
    expect(stop).toBeTypeOf('function')
    expect(listen).toHaveBeenCalledWith('vault-changed', expect.any(Function))
    expect(invoke).toHaveBeenCalledWith('vault_watch_start', { root: 'C:\Users\me\Notes' })
    expect(listen.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0])
  })

  it('passes shell events on', async () => {
    const onChange = vi.fn()
    await watchDesktopVault('tauri:/home/me/Notes', onChange)
    handler!()
    handler!()
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('stops listening and tells the shell to stop', async () => {
    const stop = await watchDesktopVault('tauri:/home/me/Notes', vi.fn())
    invoke.mockClear()
    stop!()
    expect(unlisten).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('vault_watch_stop')
  })

  it('gives up quietly when the folder cannot be watched', async () => {
    invoke.mockRejectedValueOnce('cannot watch the vault folder')
    expect(await watchDesktopVault('tauri:/mnt/share', vi.fn())).toBeNull()
    expect(unlisten).toHaveBeenCalledTimes(1)
  })
})
