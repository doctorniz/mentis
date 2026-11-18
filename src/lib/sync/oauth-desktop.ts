import { invoke } from '@tauri-apps/api/core'
import { APP_REDIRECT_URI, APP_STATE_PREFIX, OAUTH_CALLBACK_EVENT } from '@/lib/sync/oauth-session'

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
  if (__MENTIS_MOBILE__) return signInThroughWebsite(provider)
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

/** How long the phone waits for the browser to hand sign-in back. */
const PHONE_WAIT_MS = 10 * 60 * 1000

/**
 * The phone's sign-in. Android pauses an app in the background, so nothing in
 * it can answer a loopback redirect; Dropbox returns to mentis.ink instead,
 * whose callback page hands the code back as `mentis://auth/dropbox?…`
 * (Inbox.kt, launch-inbox.ts).
 */
async function signInThroughWebsite(provider: BrowserSignIn): Promise<void> {
  const state = APP_STATE_PREFIX + randomState()
  const url = new URL(provider.getAuthUrl(APP_REDIRECT_URI))
  url.searchParams.set('state', state)
  const back = new Promise<URL>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener(OAUTH_CALLBACK_EVENT, onBack)
      reject(new Error('Sign-in timed out; try connecting again.'))
    }, PHONE_WAIT_MS)
    function onBack(e: Event) {
      let returned: URL
      try {
        returned = new URL(String((e as CustomEvent).detail))
      } catch {
        return
      }
      if (returned.searchParams.get('state') !== state) return
      window.clearTimeout(timer)
      window.removeEventListener(OAUTH_CALLBACK_EVENT, onBack)
      resolve(returned)
    }
    window.addEventListener(OAUTH_CALLBACK_EVENT, onBack)
  })
  try {
    await invoke('oauth_open', { authUrl: url.toString() })
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
  const returned = await back
  const error =
    returned.searchParams.get('error_description') ?? returned.searchParams.get('error')
  if (error) throw new Error(error)
  const code = returned.searchParams.get('code')
  if (!code) throw new Error('Sign-in finished without an authorization code.')
  await provider.handleAuthCallback(code, APP_REDIRECT_URI)
}
