import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
const isTauri = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))
vi.mock('@/lib/fs/platform', () => ({ isTauri: () => isTauri() }))

import { markShellReady } from '@/lib/startup-mark'

describe('markShellReady', () => {
  beforeEach(() => {
    invoke.mockReset()
    isTauri.mockReset()
  })

  it('does nothing outside the desktop app', async () => {
    isTauri.mockReturnValue(false)
    await markShellReady()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('tells the desktop shell it is ready', async () => {
    isTauri.mockReturnValue(true)
    invoke.mockResolvedValue(undefined)
    await markShellReady()
    expect(invoke).toHaveBeenCalledWith('startup_ready')
  })

  it('never throws when the signal fails', async () => {
    isTauri.mockReturnValue(true)
    invoke.mockRejectedValue(new Error('no such command'))
    await expect(markShellReady()).resolves.toBeUndefined()
  })
})
