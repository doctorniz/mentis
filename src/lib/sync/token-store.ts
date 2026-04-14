import type { SyncTokenData } from './types'

const DB_NAME = 'mentis-sync-tokens'
const DB_VERSION = 1
const STORE_NAME = 'tokens'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tokenKey(provider: string, vaultId: string): string {
  return `${provider}:${vaultId}`
}

export async function getToken(
  provider: string,
  vaultId: string,
): Promise<SyncTokenData | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(tokenKey(provider, vaultId))
    req.onsuccess = () => resolve((req.result as SyncTokenData) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function setToken(
  provider: string,
  vaultId: string,
  token: SyncTokenData,
): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(token, tokenKey(provider, vaultId))
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function clearToken(
  provider: string,
  vaultId: string,
): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(tokenKey(provider, vaultId))
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
