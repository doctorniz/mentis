import { describe, it, expect, vi, afterEach } from 'vitest'
import { ollamaDesktopHint } from '@/lib/chat/providers/ollama'
import { testConnection } from '@/lib/chat/providers/test-connection'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Ollama desktop hint', () => {
  it('stays silent in a browser', () => {
    vi.stubGlobal('window', {})
    expect(ollamaDesktopHint()).toBe('')
  })

  it("names the app's own origin in the desktop app, never *", () => {
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {},
      location: { origin: 'http://tauri.localhost' },
    })
    expect(ollamaDesktopHint()).toContain('OLLAMA_ORIGINS=http://tauri.localhost ')
    expect(ollamaDesktopHint()).not.toContain('*')
  })

  it('is part of the connection-test error in the desktop app only', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    vi.stubGlobal('window', {})
    const web = await testConnection('ollama', '', 'http://192.168.1.5:11434')
    expect(web.ok).toBe(false)
    expect(web.error).not.toContain('OLLAMA_ORIGINS')

    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {},
      location: { origin: 'http://tauri.localhost' },
    })
    const desktop = await testConnection('ollama', '', 'http://192.168.1.5:11434')
    expect(desktop.error).toContain('OLLAMA_ORIGINS')
  })
})
