import { invoke } from '@tauri-apps/api/core'

/** Must equal the redirect URI registered with Dropbox and the one the shell listens on. */
export const DESKTOP_REDIRECT_URI = 'http://127.0.0.1:53682/auth/dropbox'

interface BrowserSignIn {
  getAuthUrl(redirectUri: string): string
  handleAuthCallback(code: string, redirectUri: string): Promise<void>
}

interface Outcome {
  code: string | null
  error: string | null
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Signs in through the system browser: the shell opens the provider's consent
 * page and waits on a loopback address for the redirect, then this exchanges
 * the code for tokens. Resolves once the tokens are saved; rejects with the
 * provider's reason if sign-in is refused, times out or is replaced.
 * Loaded only inside Tauri.
 */
export async function signInThroughBrowser(provider: BrowserSignIn): Promise<void> {
  const state = randomState()
  const url = new URL(provider.getAuthUrl(DESKTOP_REDIRECT_URI))
  url.searchParams.set('state', state)
  let outcome: Outcome
  try {
    outcome = await invoke<Outcome>('oauth_authorize', { authUrl: url.toString(), state })
  } catch (e) {
    // Tauri rejects with the shell's message as a bare string.
    throw e instanceof Error ? e : new Error(String(e))
  }
  if (outcome.error) throw new Error(outcome.error)
  if (!outcome.code) throw new Error('Sign-in finished without an authorization code.')
  await provider.handleAuthCallback(outcome.code, DESKTOP_REDIRECT_URI)
}
