import { beforeEach, describe, expect, it } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import { useVaultChatStore } from '@/stores/vault-chat'

const fs = {
  exists: async () => false,
  readdir: async () => [],
  mkdir: async () => {},
} as unknown as FileSystemAdapter

describe('leaving the chat view mid-answer', () => {
  beforeEach(() => useVaultChatStore.getState().reset())

  it('keeps the running answer when the view opens again on the same vault', async () => {
    const store = useVaultChatStore
    await store.getState().init({ vaultFs: fs, vaultPath: '/v' })
    const abort = new AbortController()
    store.setState({ isStreaming: true, abort })
    const before = store.getState().activeThreadId

    await store.getState().init({ vaultFs: fs, vaultPath: '/v' })

    expect(abort.signal.aborted).toBe(false)
    expect(store.getState().isStreaming).toBe(true)
    expect(store.getState().activeThreadId).toBe(before)
  })

  it('stops it when another vault opens', async () => {
    const store = useVaultChatStore
    await store.getState().init({ vaultFs: fs, vaultPath: '/v' })
    const abort = new AbortController()
    store.setState({ isStreaming: true, abort })

    await store.getState().init({ vaultFs: fs, vaultPath: '/w' })

    expect(abort.signal.aborted).toBe(true)
    expect(store.getState().isStreaming).toBe(false)
  })
})
