import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))

import { DESKTOP_REDIRECT_URI, signInThroughBrowser } from '@/lib/sync/oauth-desktop'

function provider() {
  return {
    getAuthUrl: vi.fn(
      (redirect: string) =>
        `https://www.dropbox.com/oauth2/authorize?client_id=k&redirect_uri=${encodeURIComponent(redirect)}`,
    ),
    handleAuthCallback: vi.fn(async () => {}),
  }
}

describe('signInThroughBrowser', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('opens the authorize URL with a fresh state and trades the code for tokens', async () => {
    invoke.mockResolvedValue({ code: 'the-code', error: null })
    const p = provider()
    await signInThroughBrowser(p)

    expect(p.getAuthUrl).toHaveBeenCalledWith(DESKTOP_REDIRECT_URI)
    const [name, args] = invoke.mock.calls[0] as [string, { authUrl: string; state: string }]
    expect(name).toBe('oauth_authorize')
    expect(args.state).toMatch(/^[0-9a-f]{32}$/)
    const url = new URL(args.authUrl)
    expect(url.searchParams.get('state')).toBe(args.state)
    expect(url.searchParams.get('redirect_uri')).toBe(DESKTOP_REDIRECT_URI)
    expect(p.handleAuthCallback).toHaveBeenCalledWith('the-code', DESKTOP_REDIRECT_URI)
  })

  it('uses a different state for each attempt', async () => {
    invoke.mockResolvedValue({ code: 'c', error: null })
    await signInThroughBrowser(provider())
    await signInThroughBrowser(provider())
    expect(invoke.mock.calls[0][1].state).not.toBe(invoke.mock.calls[1][1].state)
  })

  it('reports a refused sign-in without exchanging anything', async () => {
    invoke.mockResolvedValue({ code: null, error: 'The user said no' })
    const p = provider()
    await expect(signInThroughBrowser(p)).rejects.toThrow('The user said no')
    expect(p.handleAuthCallback).not.toHaveBeenCalled()
  })

  it('reports a reply with no code', async () => {
    invoke.mockResolvedValue({ code: null, error: null })
    await expect(signInThroughBrowser(provider())).rejects.toThrow(/without an authorization code/)
  })

  it('passes shell failures (timeout, port in use) through', async () => {
    invoke.mockRejectedValue('sign-in timed out; try connecting again')
    await expect(signInThroughBrowser(provider())).rejects.toThrow('timed out')
  })
})
