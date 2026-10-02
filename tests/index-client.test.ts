import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))

const callWorker = vi.fn(async () => 'from-worker')
vi.mock('@/core/index/worker-client', () => ({ callWorker, workerStarted: () => true }))

async function load() {
  vi.resetModules()
  return import('@/core/index/client')
}

describe('index client', () => {
  beforeEach(() => {
    invoke.mockReset()
    callWorker.mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('in the desktop app', () => {
    beforeEach(() => vi.stubGlobal('window', { __TAURI_INTERNALS__: {} }))

    it('sends each operation to the index_call command', async () => {
      invoke.mockResolvedValue([{ path: 'a.md' }])
      const { callIndex } = await load()
      expect(await callIndex('search', { query: 'a' })).toEqual([{ path: 'a.md' }])
      expect(invoke).toHaveBeenCalledWith('index_call', { op: 'search', arg: { query: 'a' } })
      expect(callWorker).not.toHaveBeenCalled()
    })

    it('keeps requests in the order they were made, even when an earlier one is slow', async () => {
      const order: string[] = []
      invoke.mockImplementation(async (_cmd: string, { op }: { op: string }) => {
        order.push(`start ${op}`)
        await new Promise((r) => setTimeout(r, op === 'open' ? 20 : 0))
        order.push(`end ${op}`)
      })
      const { callIndex } = await load()
      await Promise.all([
        callIndex('open', { vaultId: 'v' }),
        callIndex('upsert', { vaultId: 'v', docs: [] }),
        callIndex('close', undefined),
      ])
      expect(order).toEqual([
        'start open',
        'end open',
        'start upsert',
        'end upsert',
        'start close',
        'end close',
      ])
    })

    it('carries on after a failed request', async () => {
      invoke.mockRejectedValueOnce('boom').mockResolvedValueOnce([])
      const { callIndex } = await load()
      const first = callIndex('manifest', undefined)
      const second = callIndex('manifest', undefined)
      await expect(first).rejects.toBe('boom')
      await expect(second).resolves.toEqual([])
    })

    it('reports started only after a request', async () => {
      invoke.mockResolvedValue(null)
      const { callIndex, indexWorkerStarted } = await load()
      expect(indexWorkerStarted()).toBe(false)
      await callIndex('close', undefined)
      expect(indexWorkerStarted()).toBe(true)
    })
  })

  describe('in a browser', () => {
    beforeEach(() => vi.stubGlobal('window', {}))

    it('uses the worker and never the shell', async () => {
      const { callIndex, indexWorkerStarted } = await load()
      expect(indexWorkerStarted()).toBe(false)
      expect(await callIndex('manifest', undefined)).toBe('from-worker')
      expect(callWorker).toHaveBeenCalledWith('manifest', undefined)
      expect(invoke).not.toHaveBeenCalled()
      expect(indexWorkerStarted()).toBe(true)
    })
  })
})
