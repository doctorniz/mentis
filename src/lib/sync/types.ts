export interface RemoteFileEntry {
  path: string
  /** Content hash or revision ID from the remote provider */
  hash: string
  modifiedAt: string
  isDirectory: boolean
  size: number
}

export interface RemoteListResult {
  entries: RemoteFileEntry[]
  cursor: string | null
  hasMore: boolean
}

export interface RemoteChangeResult {
  entries: RemoteFileEntry[]
  deleted: string[]
  cursor: string
  hasMore: boolean
}

export interface RemoteSyncProvider {
  readonly type: 'dropbox'

  getAuthUrl(redirectUri: string): string
  handleAuthCallback(code: string, redirectUri: string): Promise<void>
  isAuthenticated(): Promise<boolean>
  logout(): Promise<void>

  /** Create remote folder chain if missing (optional). */
  prepareRemoteRoot?(): Promise<void>

  listFiles(cursor?: string): Promise<RemoteListResult>
  listChanges(cursor: string): Promise<RemoteChangeResult>

  download(remotePath: string): Promise<Uint8Array>
  upload(remotePath: string, data: Uint8Array): Promise<RemoteFileEntry>
  mkdir(remotePath: string): Promise<void>
  remove(remotePath: string): Promise<void>
}

export type SyncStatus = 'idle' | 'syncing' | 'error'

export interface SyncManifestEntry {
  path: string
  localHash: string
  remoteHash: string
  lastSyncedAt: string
}

export interface SyncManifest {
  entries: SyncManifestEntry[]
  lastCursor: string | null
  lastSyncTimestamp: string | null
}

export interface SyncTokenData {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
}

export interface LocalChangeSet {
  created: string[]
  modified: string[]
  deleted: string[]
}
