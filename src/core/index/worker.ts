/// <reference lib="webworker" />
import sqlite3InitModule, { type Database, type SAHPoolUtil } from '@sqlite.org/sqlite-wasm'
import { IndexStore } from './store'
import type { IndexOp, IndexOps, IndexRequest, IndexResponse, OpenResult } from './protocol'

/**
 * Owns the vault index database. One database per vault, in the browser's
 * private storage (OPFS, via SQLite's SAH-pool VFS) — never inside the vault
 * folder, so it is not synced or copied with the user's files.
 *
 * Requests are handled strictly in arrival order, so an `open` always
 * completes before the searches and writes posted after it.
 */

declare const self: DedicatedWorkerGlobalScope

  // Only the SAH-pool VFS is used. Where SharedArrayBuffer exists, SQLite would
  // otherwise also set up its other OPFS VFSes, each fetching and starting a
  // helper worker for nothing.
;(globalThis as { sqlite3ApiConfig?: unknown }).sqlite3ApiConfig = {
  disable: { vfs: { opfs: true, 'opfs-vfs': true, 'opfs-wl': true } },
}

const sqlite3Ready = sqlite3InitModule()
let pool: Promise<SAHPoolUtil | null> | null = null
let db: Database | null = null
let store: IndexStore | null = null
let openVaultId: string | null = null

/**
 * The pool can only be held by one tab at a time, and a page that is reloading
 * may still hold it for a moment — so retry briefly, then fall back to memory.
 */
function getPool(): Promise<SAHPoolUtil | null> {
  pool ??= (async () => {
    const sqlite3 = await sqlite3Ready
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await sqlite3.installOpfsSAHPoolVfs({
          name: 'mentis-index',
          directory: '.mentis-index',
        })
      } catch {
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)))
      }
    }
    return null
  })()
  return pool
}

/** Stable, filesystem-safe database name for a vault id (FNV-1a). */
function dbFileName(vaultId: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < vaultId.length; i++) {
    h ^= vaultId.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `/vault-${(h >>> 0).toString(16).padStart(8, '0')}.sqlite3`
}

function closeDb() {
  store = null
  openVaultId = null
  try {
    db?.close()
  } catch {
    // Already closed.
  }
  db = null
}

function openStore(database: Database): IndexStore {
  database.exec('PRAGMA temp_store = MEMORY; PRAGMA synchronous = NORMAL;')
  return new IndexStore(database)
}

async function open(vaultId: string): Promise<OpenResult> {
  closeDb()
  const sqlite3 = await sqlite3Ready
  const sah = await getPool()
  const name = dbFileName(vaultId)

  if (sah) {
    try {
      // Each database needs a slot for itself and one for its journal.
      await sah.reserveMinimumCapacity(sah.getFileCount() + 3)
      try {
        db = new sah.OpfsSAHPoolDb(name)
        store = openStore(db)
      } catch {
        // Unreadable (corrupt, or written by something else). It is derived
        // data, so delete it and start again.
        closeDb()
        sah.unlink(name)
        db = new sah.OpfsSAHPoolDb(name)
        store = openStore(db)
      }
      openVaultId = vaultId
      return { persisted: true, fileCount: store.fileCount() }
    } catch {
      closeDb()
    }
  }

  db = new sqlite3.oo1.DB(':memory:')
  store = openStore(db)
  openVaultId = vaultId
  return { persisted: false, fileCount: 0 }
}

type Handler<K extends IndexOp> = (arg: IndexOps[K][0]) => IndexOps[K][1] | Promise<IndexOps[K][1]>

const handlers: { [K in IndexOp]: Handler<K> } = {
  open: ({ vaultId }) => open(vaultId),
  close: () => closeDb(),
  manifest: () => store?.manifest() ?? [],
  // Writes carry the vault they were meant for; late ones for a vault that has
  // since been closed are dropped rather than landing in the wrong index.
  upsert: ({ vaultId, docs }) => {
    if (vaultId === openVaultId) store?.upsert(docs)
  },
  remove: ({ vaultId, paths }) => {
    if (vaultId === openVaultId) store?.remove(paths)
  },
  search: ({ query, filters }) => store?.search(query, filters) ?? [],
  searchDocuments: ({ query, topK }) => store?.searchDocuments(query, topK) ?? [],
}

let queue: Promise<void> = Promise.resolve()

self.onmessage = (event: MessageEvent<IndexRequest>) => {
  const { id, op, arg } = event.data
  queue = queue.then(async () => {
    let response: IndexResponse
    try {
      const handler = handlers[op] as Handler<typeof op>
      response = { id, ok: true, result: await handler(arg as never) }
    } catch (err) {
      response = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    self.postMessage(response)
  })
}
