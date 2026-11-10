/**
 * API keys for the chat providers: one per provider, per device. They are never
 * in `config.json` and never sync; nothing readable by someone who copies the
 * vault, the browser profile or the disk.
 *
 * - The desktop app keeps them in the operating system's credential store
 *   (`src-tauri/src/secrets.rs`): Credential Manager, Keychain, Secret Service.
 * - Elsewhere (the website, the phone apps) a key is encrypted with AES-GCM and
 *   the encryption key is a non-extractable `CryptoKey` kept in IndexedDB. That
 *   stops the key being read out of storage; script running on the page could
 *   still ask the browser to decrypt, so it is the weaker of the two.
 * - Where the desktop store fails (Linux without a Secret Service), the key is
 *   kept the second way rather than lost.
 *
 * Keys saved before this, as plain text in `mentis-llm-keys` and per vault, are
 * moved on first use and that database is deleted.
 */

import { isDesktopApp } from '@/lib/fs/platform'
import type { ChatKeyRecord, ChatProviderId } from '@/types/chat'

const PROVIDERS: readonly ChatProviderId[] = [
  'openrouter',
  'anthropic',
  'openai',
  'gemini',
  'ollama',
  'llamacpp',
]

const secretName = (provider: ChatProviderId) => `llm:${provider}`

/* ------------------------------------------------------------------ */
/*  Encryption                                                         */
/* ------------------------------------------------------------------ */

export interface EncryptedSecret {
  iv: Uint8Array<ArrayBuffer>
  data: ArrayBuffer
}

export async function encryptSecret(key: CryptoKey, text: string): Promise<EncryptedSecret> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new Uint8Array(new TextEncoder().encode(text)),
  )
  return { iv, data }
}

export async function decryptSecret(key: CryptoKey, rec: EncryptedSecret): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, key, rec.data)
  return new TextDecoder().decode(plain)
}

/* ------------------------------------------------------------------ */
/*  Browser backend: encrypted records in IndexedDB                    */
/* ------------------------------------------------------------------ */

const DB_NAME = 'mentis-secrets'
const STORE = 'secrets'
const MASTER = 'master'

function openDb(name: string, store: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function request<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest,
) {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = run(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req.result as T)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** The device's encryption key, made on first use and never exportable. */
async function masterKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await request<CryptoKey | undefined>(db, 'readonly', (s) => s.get(MASTER))
  if (existing) return existing
  const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  // Another tab may have made one meanwhile: the first stored wins.
  const winner = await request<CryptoKey | undefined>(db, 'readwrite', (s) => s.get(MASTER))
  if (winner) return winner
  await request(db, 'readwrite', (s) => s.put(fresh, MASTER))
  return fresh
}

const webStore = {
  async get(name: string): Promise<string | null> {
    const db = await openDb(DB_NAME, STORE)
    try {
      const rec = await request<EncryptedSecret | undefined>(db, 'readonly', (s) => s.get(name))
      if (!rec) return null
      return await decryptSecret(await masterKey(db), rec)
    } finally {
      db.close()
    }
  },
  async set(name: string, value: string): Promise<void> {
    const db = await openDb(DB_NAME, STORE)
    try {
      const rec = await encryptSecret(await masterKey(db), value)
      await request(db, 'readwrite', (s) => s.put(rec, name))
    } finally {
      db.close()
    }
  },
  async remove(name: string): Promise<void> {
    const db = await openDb(DB_NAME, STORE)
    try {
      await request(db, 'readwrite', (s) => s.delete(name))
    } finally {
      db.close()
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Desktop backend: the OS credential store                           */
/* ------------------------------------------------------------------ */

async function osCall<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

const osStore = {
  get: (name: string) => osCall<string | null>('secret_get', { name }),
  set: (name: string, value: string) => osCall<void>('secret_set', { name, value }),
  remove: (name: string) => osCall<void>('secret_delete', { name }),
}

/* ------------------------------------------------------------------ */
/*  Keys saved before: plain text, per vault                           */
/* ------------------------------------------------------------------ */

const LEGACY_DB = 'mentis-llm-keys'
const MIGRATED_FLAG = 'mentis:llm-keys-migrated'

/** The first key found for each provider; the old ones were per vault. */
async function readLegacyKeys(): Promise<Map<ChatProviderId, string>> {
  const db = await openDb(LEGACY_DB, 'keys')
  try {
    return await new Promise((resolve, reject) => {
      const found = new Map<ChatProviderId, string>()
      const req = db.transaction('keys', 'readonly').objectStore('keys').openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return resolve(found)
        const [, provider] = String(cursor.key).split(':')
        const apiKey = (cursor.value as ChatKeyRecord | undefined)?.apiKey
        if (
          apiKey &&
          PROVIDERS.includes(provider as ChatProviderId) &&
          !found.has(provider as ChatProviderId)
        ) {
          found.set(provider as ChatProviderId, apiKey)
        }
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

async function migrateLegacyKeys(): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED_FLAG)) return
  } catch {
    /* no storage: try anyway */
  }
  try {
    const keys = await readLegacyKeys()
    for (const [provider, apiKey] of keys) await save(provider, apiKey)
    // Only once every key is safe somewhere else.
    await deleteDb(LEGACY_DB)
    try {
      localStorage.setItem(MIGRATED_FLAG, '1')
    } catch {
      /* swallow */
    }
  } catch {
    /* keep the old copy and try again next time */
  }
}

let migrated: Promise<void> | null = null
const ready = () => (migrated ??= migrateLegacyKeys())

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

async function save(provider: ChatProviderId, apiKey: string): Promise<void> {
  const name = secretName(provider)
  if (isDesktopApp()) {
    try {
      await osStore.set(name, apiKey)
      await webStore.remove(name).catch(() => undefined)
      return
    } catch {
      /* no usable OS store: keep it the other way */
    }
  }
  await webStore.set(name, apiKey)
}

export async function getChatKey(provider: ChatProviderId): Promise<ChatKeyRecord | null> {
  await ready()
  const name = secretName(provider)
  if (isDesktopApp()) {
    try {
      const v = await osStore.get(name)
      if (v) return { apiKey: v }
    } catch {
      /* fall through to the other copy */
    }
  }
  const v = await webStore.get(name)
  return v ? { apiKey: v } : null
}

export async function setChatKey(provider: ChatProviderId, record: ChatKeyRecord): Promise<void> {
  await ready()
  await save(provider, record.apiKey)
}

export async function clearChatKey(provider: ChatProviderId): Promise<void> {
  await ready()
  const name = secretName(provider)
  await Promise.allSettled([isDesktopApp() ? osStore.remove(name) : null, webStore.remove(name)])
}

/** Fast "is this provider configured?" check for gating the chat UI. */
export async function hasChatKey(provider: ChatProviderId): Promise<boolean> {
  return !!(await getChatKey(provider))?.apiKey
}

/* ------------------------------------------------------------------ */
/*  Reactivity signal                                                  */
/* ------------------------------------------------------------------ */

/**
 * Custom event name dispatched on `window` whenever a chat key is saved
 * or cleared. Chat panels listen to this to re-read their API key without
 * requiring a full page refresh.
 */
export const CHAT_KEY_CHANGED_EVENT = 'ink:chat-key-changed'

/** Dispatch the key-changed signal. Called after setChatKey / clearChatKey. */
export function notifyChatKeyChanged(): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(CHAT_KEY_CHANGED_EVENT))
  } catch {
    /* swallow — no window in SSR */
  }
}
