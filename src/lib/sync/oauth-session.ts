/** Session keys for OAuth return — must match auth callback pages. */

export const DROPBOX_OAUTH_SESSION_KEY = 'mentis_sync_oauth_dropbox'

/** Window event: a sync sign-in finished in place, so sync should look for its token. */
export const SYNC_SIGNED_IN_EVENT = 'ink:sync-signed-in'

/** Window event, on the phone: sign-in came back as a `mentis://auth/…` address (detail). */
export const OAUTH_CALLBACK_EVENT = 'mentis:oauth-callback'

/**
 * A `state` starting with this marks a sign-in started by the phone app: the
 * website's callback page hands the code back to the app instead of using it.
 */
export const APP_STATE_PREFIX = 'app-'

/** Where the phone app's sign-in returns (registered with Dropbox). */
export const APP_REDIRECT_URI = 'https://mentis.ink/auth/dropbox'

export interface DropboxOAuthSession {
  /** Must match `SyncProvider` token key (`activeVaultPath` / scoped vault path). */
  vaultId: string
  remoteRoot: string
}

export function stashDropboxOAuthSession(data: DropboxOAuthSession): void {
  localStorage.setItem(DROPBOX_OAUTH_SESSION_KEY, JSON.stringify(data))
}

export function readDropboxOAuthSession(): DropboxOAuthSession | null {
  try {
    const raw = localStorage.getItem(DROPBOX_OAUTH_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as DropboxOAuthSession
  } catch {
    return null
  }
}

export function clearDropboxOAuthSession(): void {
  localStorage.removeItem(DROPBOX_OAUTH_SESSION_KEY)
}
