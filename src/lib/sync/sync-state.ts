import type { SyncManifestEntry } from './types'

const DB_NAME = 'mentis-sync'
const DB_VERSION = 1
const ENTRIES_STORE = 'manifest-entries'
const META_STORE = 'manifest-meta'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
        db.createObjectStore(ENTRIES_STORE)
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function entryKey(vaultId: string, path: string): string {
  return `${vaultId}:${path}`
}

function metaKey(vaultId: string, field: string): string {
  return `${vaultId}:${field}`
}

export class SyncState {
  constructor(private vaultId: string) {}

  async getEntry(path: string): Promise<SyncManifestEntry | null> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENTRIES_STORE, 'readonly')
      const store = tx.objectStore(ENTRIES_STORE)
      const req = store.get(entryKey(this.vaultId, path))
      req.onsuccess = () => resolve((req.result as SyncManifestEntry) ?? null)
      req.onerror = () => reject(req.error)
    })
  }

  async setEntry(entry: SyncManifestEntry): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENTRIES_STORE, 'readwrite')
      const store = tx.objectStore(ENTRIES_STORE)
      const req = store.put(entry, entryKey(this.vaultId, entry.path))
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async removeEntry(path: string): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENTRIES_STORE, 'readwrite')
      const store = tx.objectStore(ENTRIES_STORE)
      const req = store.delete(entryKey(this.vaultId, path))
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async getAllEntries(): Promise<SyncManifestEntry[]> {
    const db = await openDb()
    const prefix = `${this.vaultId}:`
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENTRIES_STORE, 'readonly')
      const store = tx.objectStore(ENTRIES_STORE)
      const req = store.getAll()
      const keysReq = store.getAllKeys()
      const entries: SyncManifestEntry[] = []
      tx.oncomplete = () => resolve(entries)
      tx.onerror = () => reject(tx.error)
      keysReq.onsuccess = () => {
        req.onsuccess = () => {
          const allKeys = keysReq.result as string[]
          const allVals = req.result as SyncManifestEntry[]
          for (let i = 0; i < allKeys.length; i++) {
            if (allKeys[i].startsWith(prefix)) {
              entries.push(allVals[i])
            }
          }
        }
      }
    })
  }

  async setEntries(entries: SyncManifestEntry[]): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENTRIES_STORE, 'readwrite')
      const store = tx.objectStore(ENTRIES_STORE)
      for (const entry of entries) {
        store.put(entry, entryKey(this.vaultId, entry.path))
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async getCursor(): Promise<string | null> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly')
      const store = tx.objectStore(META_STORE)
      const req = store.get(metaKey(this.vaultId, 'cursor'))
      req.onsuccess = () => resolve((req.result as string) ?? null)
      req.onerror = () => reject(req.error)
    })
  }

  async setCursor(cursor: string): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite')
      const store = tx.objectStore(META_STORE)
      const req = store.put(cursor, metaKey(this.vaultId, 'cursor'))
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async getLastSyncTimestamp(): Promise<string | null> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly')
      const store = tx.objectStore(META_STORE)
      const req = store.get(metaKey(this.vaultId, 'lastSync'))
      req.onsuccess = () => resolve((req.result as string) ?? null)
      req.onerror = () => reject(req.error)
    })
  }

  async setLastSyncTimestamp(ts: string): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite')
      const store = tx.objectStore(META_STORE)
      const req = store.put(ts, metaKey(this.vaultId, 'lastSync'))
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async clear(): Promise<void> {
    const allEntries = await this.getAllEntries()
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([ENTRIES_STORE, META_STORE], 'readwrite')
      const entryStore = tx.objectStore(ENTRIES_STORE)
      const metaStore = tx.objectStore(META_STORE)
      for (const e of allEntries) {
        entryStore.delete(entryKey(this.vaultId, e.path))
      }
      metaStore.delete(metaKey(this.vaultId, 'cursor'))
      metaStore.delete(metaKey(this.vaultId, 'lastSync'))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}
