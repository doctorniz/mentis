import type {
  RemoteSyncProvider,
  RemoteFileEntry,
  RemoteListResult,
  RemoteChangeResult,
  SyncTokenData,
} from '../types'
import { getToken, setToken, clearToken } from '../token-store'

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize'
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'
const API_URL = 'https://api.dropboxapi.com/2'
const CONTENT_URL = 'https://content.dropboxapi.com/2'

/**
 * Dropbox sync provider using **Full Dropbox** access (scoped, not app-folder).
 * `remoteRoot` is an absolute Dropbox path, e.g. `/Apps/Mentis/MyVault`.
 * Leading slashes are normalised internally; the path is stored in `VaultConfig.sync.remotePath`.
 */
export class DropboxProvider implements RemoteSyncProvider {
  readonly type = 'dropbox' as const

  private clientId: string
  private vaultId: string
  private remoteRoot: string
  private codeVerifier: string | null = null

  constructor(opts: {
    clientId: string
    vaultId: string
    remoteRoot: string
  }) {
    this.clientId = opts.clientId
    this.vaultId = opts.vaultId
    this.remoteRoot = opts.remoteRoot.replace(/\/+$/, '').replace(/^\/+/, '')
  }

  /** Create `remoteRoot` and parents on Dropbox before list/upload (first sync). */
  async prepareRemoteRoot(): Promise<void> {
    if (!this.remoteRoot) return
    const parts = this.remoteRoot.split('/').filter(Boolean)
    let built = ''
    for (const p of parts) {
      built = built ? `${built}/${p}` : p
      await this.mkdirAbsolute(`/${built}`)
    }
  }

  private async mkdirAbsolute(dropboxPath: string): Promise<void> {
    const accessToken = await this.getAccessToken()
    const res = await fetch(`${API_URL}/files/create_folder_v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: dropboxPath, autorename: false }),
    })
    if (!res.ok) {
      const text = await res.text()
      if (res.status === 409 && text.includes('path/conflict')) return
      throw new Error(`Dropbox create_folder_v2 failed: ${text}`)
    }
  }

  // --------------- OAuth PKCE ---------------

  getAuthUrl(redirectUri: string): string {
    const verifier = generateCodeVerifier()
    this.codeVerifier = verifier
    localStorage.setItem('dbx_code_verifier', verifier)

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge: verifier,
      code_challenge_method: 'plain',
      token_access_type: 'offline',
    })
    return `${AUTH_URL}?${params.toString()}`
  }

  async handleAuthCallback(
    code: string,
    redirectUri: string,
  ): Promise<void> {
    const verifier =
      this.codeVerifier ?? localStorage.getItem('dbx_code_verifier')
    if (!verifier) throw new Error('Missing PKCE code verifier')

    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    })

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Dropbox token exchange failed: ${text}`)
    }
    const json = await res.json()
    await this.saveToken(json)
    localStorage.removeItem('dbx_code_verifier')
    this.codeVerifier = null
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await getToken('dropbox', this.vaultId)
    if (!token) return false
    if (Date.now() < token.expiresAt) return true
    if (!token.refreshToken) return false
    try {
      await this.refreshAccessToken(token)
      return true
    } catch {
      return false
    }
  }

  async logout(): Promise<void> {
    try {
      const accessToken = await this.getAccessToken()
      await fetch(`${API_URL}/auth/token/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    } catch {
      // best-effort revocation
    }
    await clearToken('dropbox', this.vaultId)
  }

  // --------------- File operations ---------------

  async listFiles(cursor?: string): Promise<RemoteListResult> {
    if (cursor) {
      return this.listFilesContinue(cursor)
    }

    const accessToken = await this.getAccessToken()
    const res = await fetch(`${API_URL}/files/list_folder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: dropboxListFolderPath(this.remoteRoot),
        recursive: true,
        include_deleted: false,
      }),
    })
    if (!res.ok) throw await apiError(res, 'list_folder')
    const json = await res.json()
    return {
      entries: json.entries
        .filter((e: DropboxEntry) => e['.tag'] !== 'deleted')
        .map((e: DropboxEntry) => toRemoteEntry(e, this.remoteRoot)),
      cursor: json.cursor ?? null,
      hasMore: json.has_more ?? false,
    }
  }

  private async listFilesContinue(cursor: string): Promise<RemoteListResult> {
    const accessToken = await this.getAccessToken()
    const res = await fetch(`${API_URL}/files/list_folder/continue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cursor }),
    })
    if (!res.ok) throw await apiError(res, 'list_folder/continue')
    const json = await res.json()
    return {
      entries: json.entries
        .filter((e: DropboxEntry) => e['.tag'] !== 'deleted')
        .map((e: DropboxEntry) => toRemoteEntry(e, this.remoteRoot)),
      cursor: json.cursor ?? null,
      hasMore: json.has_more ?? false,
    }
  }

  async listChanges(cursor: string): Promise<RemoteChangeResult> {
    const accessToken = await this.getAccessToken()
    const res = await fetch(`${API_URL}/files/list_folder/continue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cursor }),
    })
    if (!res.ok) throw await apiError(res, 'list_folder/continue (changes)')
    const json = await res.json()

    const entries: RemoteFileEntry[] = []
    const deleted: string[] = []

    for (const e of json.entries as DropboxEntry[]) {
      if (e['.tag'] === 'deleted') {
        deleted.push(stripVaultRoot(e.path_display ?? e.path_lower ?? '', this.remoteRoot))
      } else {
        entries.push(toRemoteEntry(e, this.remoteRoot))
      }
    }

    return {
      entries,
      deleted,
      cursor: json.cursor,
      hasMore: json.has_more ?? false,
    }
  }

  async download(remotePath: string): Promise<Uint8Array> {
    const accessToken = await this.getAccessToken()
    const fullPath = dropboxJoin(this.remoteRoot, remotePath)
    const res = await fetch(`${CONTENT_URL}/files/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Dropbox-API-Arg': encodeDropboxApiArgHeader({ path: fullPath }),
      },
    })
    if (!res.ok) throw await apiError(res, 'download')
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  }

  async upload(
    remotePath: string,
    data: Uint8Array,
  ): Promise<RemoteFileEntry> {
    const accessToken = await this.getAccessToken()
    const fullPath = dropboxJoin(this.remoteRoot, remotePath)
    const res = await fetch(`${CONTENT_URL}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Dropbox-API-Arg': encodeDropboxApiArgHeader({
          path: fullPath,
          mode: 'overwrite',
          autorename: false,
          mute: true,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: data.buffer as ArrayBuffer,
    })
    if (!res.ok) throw await apiError(res, 'upload')
    const json = await res.json()
    return toRemoteEntry(json, this.remoteRoot)
  }

  async mkdir(remotePath: string): Promise<void> {
    const accessToken = await this.getAccessToken()
    const fullPath = dropboxJoin(this.remoteRoot, remotePath)
    const res = await fetch(`${API_URL}/files/create_folder_v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: fullPath, autorename: false }),
    })
    if (!res.ok) {
      const text = await res.text()
      // 409 = path/conflict means folder already exists — not an error
      if (res.status === 409 && text.includes('path/conflict')) return
      throw new Error(`Dropbox create_folder_v2 failed: ${text}`)
    }
  }

  async remove(remotePath: string): Promise<void> {
    const accessToken = await this.getAccessToken()
    const fullPath = dropboxJoin(this.remoteRoot, remotePath)
    const res = await fetch(`${API_URL}/files/delete_v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: fullPath }),
    })
    if (!res.ok) {
      const text = await res.text()
      if (res.status === 409 && text.includes('path_lookup/not_found')) return
      throw new Error(`Dropbox delete_v2 failed: ${text}`)
    }
  }

  // --------------- Token helpers ---------------

  private async getAccessToken(): Promise<string> {
    let token = await getToken('dropbox', this.vaultId)
    if (!token) throw new Error('Not authenticated with Dropbox')

    if (Date.now() >= token.expiresAt - 60_000) {
      if (!token.refreshToken) throw new Error('Dropbox token expired; no refresh token')
      token = await this.refreshAccessToken(token)
    }
    return token.accessToken
  }

  private async refreshAccessToken(
    token: SyncTokenData,
  ): Promise<SyncTokenData> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken!,
      client_id: this.clientId,
    })
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Dropbox token refresh failed: ${text}`)
    }
    const json = await res.json()
    const newToken: SyncTokenData = {
      accessToken: json.access_token,
      refreshToken: token.refreshToken,
      expiresAt: Date.now() + json.expires_in * 1000,
    }
    await setToken('dropbox', this.vaultId, newToken)
    return newToken
  }

  private async saveToken(json: Record<string, unknown>): Promise<void> {
    const token: SyncTokenData = {
      accessToken: json.access_token as string,
      refreshToken: (json.refresh_token as string) ?? null,
      expiresAt: Date.now() + (json.expires_in as number) * 1000,
    }
    await setToken('dropbox', this.vaultId, token)
  }
}

// --------------- Helpers ---------------

/**
 * `Dropbox-API-Arg` is JSON. `fetch()` requires header values to be ISO-8859-1; raw
 * `JSON.stringify` breaks on Unicode in paths (e.g. vault or file names). Encode
 * UTF-8 bytes as a Latin-1 byte string so the wire payload matches UTF-8 JSON.
 */
export function encodeDropboxApiArgHeader(payload: object): string {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]!)
  }
  return out
}

interface DropboxEntry {
  '.tag': 'file' | 'folder' | 'deleted'
  path_display?: string
  path_lower?: string
  content_hash?: string
  server_modified?: string
  size?: number
  name?: string
}

function toRemoteEntry(e: DropboxEntry, root: string): RemoteFileEntry {
  const raw = e.path_display ?? e.path_lower ?? ''
  return {
    path: stripVaultRoot(raw, root),
    hash: e.content_hash ?? '',
    modifiedAt: e.server_modified ?? new Date().toISOString(),
    isDirectory: e['.tag'] === 'folder',
    size: e.size ?? 0,
  }
}

/** Path for `files/list_folder` — app-folder root is `""`. */
function dropboxListFolderPath(remoteRoot: string): string {
  const r = remoteRoot.replace(/\/+$/, '').replace(/^\/+/, '')
  return r ? `/${r}` : ''
}

/** Join vault-relative path to Dropbox API path (leading `/`). */
function dropboxJoin(remoteRoot: string, relative: string): string {
  const r = remoteRoot.replace(/\/+$/, '').replace(/^\/+/, '')
  const p = relative.replace(/^\/+/, '')
  if (!r && !p) return ''
  if (!r) return `/${p}`
  if (!p) return `/${r}`
  return `/${r}/${p}`
}

/**
 * Strip configured vault root from Dropbox `path_display` (may include `/Apps/<app>/` prefix).
 */
function stripVaultRoot(full: string, vaultRoot: string): string {
  const v = vaultRoot.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase()
  if (!v) return full.replace(/^\/+/, '')
  const lower = full.toLowerCase()
  const needle = `/${v}/`
  const i = lower.indexOf(needle)
  if (i !== -1) return full.slice(i + needle.length)
  if (lower === `/${v}` || lower === v) return ''
  if (lower.endsWith(`/${v}`)) return ''
  const legacy = lower.indexOf(`/apps/`)
  if (legacy !== -1) {
    const after = full.slice(legacy)
    const j = after.toLowerCase().indexOf(`/${v}/`)
    if (j !== -1) return after.slice(j + v.length + 2)
  }
  return full.replace(/^\/+/, '')
}

async function apiError(res: Response, label: string): Promise<Error> {
  const text = await res.text().catch(() => '(unreadable body)')
  return new Error(`Dropbox ${label} failed (${res.status}): ${text}`)
}

// --------------- PKCE utilities ---------------

function generateCodeVerifier(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return base64UrlEncode(arr)
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
