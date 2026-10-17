import { describe, it, expect } from 'vitest'
import { readHandle } from '@/lib/fs/read-handle'

/** A handle whose first `stale` reads fail as a File does while its file is rewritten. */
function handle(stale: number, error = 'NotReadableError') {
  let calls = 0
  const h = {
    getFile: async () => {
      calls++
      const fails = calls <= stale
      return {
        text: async () => {
          if (fails) throw new DOMException('stale', error)
          return 'contents'
        },
      } as unknown as File
    },
  } as unknown as FileSystemFileHandle
  return { h, calls: () => calls }
}

describe('readHandle', () => {
  it('reads a fresh File when the first one went stale', async () => {
    const { h, calls } = handle(2)
    expect(await readHandle(h, (f) => f.text())).toBe('contents')
    expect(calls()).toBe(3)
  })

  it('gives up after a few attempts', async () => {
    const { h } = handle(10)
    await expect(readHandle(h, (f) => f.text(), 3)).rejects.toThrow('stale')
  })

  it('does not retry other errors', async () => {
    const { h, calls } = handle(1, 'NotFoundError')
    await expect(readHandle(h, (f) => f.text())).rejects.toThrow('stale')
    expect(calls()).toBe(1)
  })
})
