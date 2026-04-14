/** Session keys for OAuth return — must match auth callback pages. */

export const DROPBOX_OAUTH_SESSION_KEY = 'mentis_sync_oauth_dropbox'

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
