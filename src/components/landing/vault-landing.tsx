'use client'

import { useCallback, useEffect, useState } from 'react'
import { Brain, FolderOpen, Loader2, PlugZap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getFileSystemAdapter,
  createScopedAdapter,
  FsapiAdapter,
  isFsapiSupported,
  pickDirectoryFsapi,
  storeDirectoryHandle,
  getStoredDirectoryHandle,
  clearStoredDirectoryHandle,
} from '@/lib/fs'
import type { FileSystemAdapter } from '@/lib/fs'
import { bootstrapNewVault, loadVaultConfig, createVault, isVault } from '@/lib/vault'
import { discoverVaults } from '@/lib/vault/discover'
import {
  getStoredActiveVaultPath,
  setStoredActiveVaultPath,
} from '@/lib/vault/session-storage'
import type { VaultConfig } from '@/types/vault'

export interface VaultLandingProps {
  onVaultReady: (session: {
    rootFs: FileSystemAdapter
    vaultFs: FileSystemAdapter
    vaultPath: string
    config: VaultConfig
  }) => void
}

function fsapiVaultPath(handle: FileSystemDirectoryHandle) {
  return `fsapi:${handle.name}`
}

export function VaultLanding({ onVaultReady }: VaultLandingProps) {
  const [name, setName] = useState('My Vault')
  const [vaults, setVaults] = useState<{ path: string; displayName: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null)

  const refreshList = useCallback(async (root: FileSystemAdapter) => {
    const list = await discoverVaults(root)
    setVaults(list.map((v) => ({ path: v.path, displayName: v.displayName })))
  }, [])

  /** Open a vault from an FSAPI adapter that already passed init(). */
  const openFsapiVault = useCallback(
    async (fsapi: FsapiAdapter) => {
      const handle = fsapi.directoryHandle
      const vaultPath = fsapiVaultPath(handle)
      if (await isVault(fsapi)) {
        const config = await loadVaultConfig(fsapi)
        setStoredActiveVaultPath(vaultPath)
        await storeDirectoryHandle(handle)
        onVaultReady({ rootFs: fsapi, vaultFs: fsapi, vaultPath, config })
      } else {
        const config = await createVault(fsapi, 'My Vault')
        setStoredActiveVaultPath(vaultPath)
        await storeDirectoryHandle(handle)
        onVaultReady({ rootFs: fsapi, vaultFs: fsapi, vaultPath, config })
      }
    },
    [onVaultReady],
  )

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setLoading(true)
      setError(null)
      try {
        const root = await getFileSystemAdapter()
        await root.init()
        if (cancelled) return
        await refreshList(root)

        /* ── Try restoring an OPFS vault first ── */
        const stored = getStoredActiveVaultPath()
        if (stored && !stored.startsWith('fsapi:')) {
          const scoped = createScopedAdapter(root, stored)
          if (await isVault(scoped)) {
            const config = await loadVaultConfig(scoped)
            if (!cancelled) {
              onVaultReady({
                rootFs: root,
                vaultFs: scoped,
                vaultPath: stored,
                config,
              })
              return
            }
          } else {
            setStoredActiveVaultPath(null)
          }
        }

        /* ── Try restoring a disk-folder (FSAPI) handle from IndexedDB ── */
        if (isFsapiSupported() && stored?.startsWith('fsapi:')) {
          try {
            const handle = await getStoredDirectoryHandle()
            if (handle && !cancelled) {
              const perm = await handle.queryPermission({ mode: 'readwrite' })
              if (perm === 'granted') {
                const fsapi = new FsapiAdapter(handle)
                await fsapi.init()
                if (!cancelled) {
                  await openFsapiVault(fsapi)
                  return
                }
              } else if (perm === 'prompt') {
                if (!cancelled) setPendingHandle(handle)
              } else {
                await clearStoredDirectoryHandle()
                setStoredActiveVaultPath(null)
              }
            }
          } catch {
            await clearStoredDirectoryHandle().catch(() => {})
            setStoredActiveVaultPath(null)
          }
        }
      } catch (e) {
        if (!cancelled) {
          const msg =
            e instanceof Error
              ? e.message
              : 'Could not access local storage. Try a Chromium-based browser with OPFS support.'
          setError(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [onVaultReady, openFsapiVault, refreshList])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const root = await getFileSystemAdapter()
      await root.init()
      const { vaultPath, config } = await bootstrapNewVault(root, name.trim() || 'My Vault')
      const vaultFs = createScopedAdapter(root, vaultPath)
      setStoredActiveVaultPath(vaultPath)
      await refreshList(root)
      onVaultReady({ rootFs: root, vaultFs, vaultPath, config })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create vault')
    } finally {
      setBusy(false)
    }
  }

  async function handleOpenFolder() {
    setBusy(true)
    setError(null)
    try {
      const fsapi = await pickDirectoryFsapi()
      await openFsapiVault(fsapi)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        /* user cancelled the picker */
      } else {
        setError(e instanceof Error ? e.message : 'Failed to open folder')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleReconnect() {
    if (!pendingHandle) return
    setBusy(true)
    setError(null)
    try {
      const fsapi = new FsapiAdapter(pendingHandle)
      await fsapi.init()
      setPendingHandle(null)
      await openFsapiVault(fsapi)
    } catch (e) {
      setPendingHandle(null)
      await clearStoredDirectoryHandle().catch(() => {})
      setStoredActiveVaultPath(null)
      setError(e instanceof Error ? e.message : 'Could not reconnect — please open the folder again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleOpen(path: string) {
    setBusy(true)
    setError(null)
    try {
      const root = await getFileSystemAdapter()
      await root.init()
      const vaultFs = createScopedAdapter(root, path)
      if (!(await isVault(vaultFs))) {
        setError('That folder is not a valid Mentis vault.')
        return
      }
      const config = await loadVaultConfig(vaultFs)
      setStoredActiveVaultPath(path)
      onVaultReady({ rootFs: root, vaultFs, vaultPath: path, config })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open vault')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="text-accent size-10 animate-spin" aria-hidden />
        <p className="text-fg-secondary text-sm">Opening local storage…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="bg-accent-light text-accent mb-4 flex size-16 items-center justify-center rounded-2xl">
            <Brain className="size-9" strokeWidth={1.5} aria-hidden />
          </div>
          <h1 className="text-fg text-3xl font-bold tracking-tight">Mentis</h1>
          <p className="text-fg-muted mt-1 text-xs font-medium tracking-wide uppercase">
            an app by Marrow Group
          </p>
          <p className="text-fg-secondary mt-4 text-sm leading-relaxed">
            Local first
          </p>
        </div>

        {error && (
          <div
            className="border-danger/30 bg-danger/5 text-danger mb-6 rounded-lg border px-4 py-3 text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        {pendingHandle && (
          <div className="bg-accent/5 border-accent/30 mb-8 rounded-lg border p-4">
            <p className="text-fg text-sm font-medium">
              Reconnect to <span className="font-semibold">{pendingHandle.name}</span>?
            </p>
            <p className="text-fg-secondary mt-1 text-xs">
              The browser needs your permission to re-open this folder.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() => void handleReconnect()}
              >
                <PlugZap className="size-3.5" />
                Reconnect
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setPendingHandle(null)
                  void clearStoredDirectoryHandle()
                  setStoredActiveVaultPath(null)
                }}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreate} className="mb-10 space-y-4">
          <label className="block">
            <span className="text-fg-secondary text-center mb-1.5 block text-xs font-medium uppercase tracking-wide">
              New vault
            </span>
            <input
              type="text"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              placeholder="Vault name"
              className="border-border-strong text-center focus:border-accent focus:ring-accent/20 bg-bg text-fg placeholder:text-fg-muted w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm focus:ring-2 focus:outline-none"
              disabled={busy}
            />
          </label>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Working…
              </>
            ) : (
              'Create'
            )}
          </Button>
        </form>

        {isFsapiSupported() && (
          <div className="mb-10">
            <div className="relative mb-4 flex items-center justify-center">
              <span className="bg-bg-secondary text-fg-muted relative z-10 px-3 text-xs">or</span>
              <div className="border-border absolute inset-x-0 top-1/2 border-t" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={busy}
              onClick={() => void handleOpenFolder()}
            >
              <FolderOpen className="size-4" />
              Open a folder
            </Button>
            <p className="text-fg-muted mt-2 text-center text-xs">
              Chromium only
            </p>
          </div>
        )}

        {vaults.length > 0 && (
          <div>
            <h2 className="text-fg-secondary mb-3 text-xs font-semibold tracking-wide uppercase">
              Open existing
            </h2>
            <ul className="border-border divide-border max-h-64 divide-y overflow-auto rounded-lg border">
              {vaults.map((v) => (
                <li key={v.path}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleOpen(v.path)}
                    className="hover:bg-bg-hover text-fg flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <span className="truncate">{v.displayName}</span>
                    <span className="text-fg-muted ml-2 shrink-0 font-mono text-xs">
                      {v.path.replace(/^vaults\//, '')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
