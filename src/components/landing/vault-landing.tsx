'use client'

import { useEffect, useState } from 'react'
import { Brain, FolderOpen, Info, Loader2, PlugZap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  canOpenFolder,
  createBrowserVault,
  forgetLastVault,
  listBrowserVaults,
  openBrowserVault,
  openFolderVault,
  restoreLastVault,
  type BrowserVault,
  type VaultSession,
} from '@/lib/vault/session'

export interface VaultLandingProps {
  onVaultReady: (session: VaultSession) => void
  onShowAbout?: () => void
}

interface PendingFolder {
  name: string
  reconnect: () => Promise<VaultSession>
}

export function VaultLanding({ onVaultReady, onShowAbout }: VaultLandingProps) {
  const [name, setName] = useState('My Vault')
  const [vaults, setVaults] = useState<BrowserVault[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingFolder, setPendingFolder] = useState<PendingFolder | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    async function boot() {
      let opened = false
      setLoading(true)
      setError(null)
      try {
        const list = await listBrowserVaults()
        if (abort.signal.aborted) return
        setVaults(list)

        const restored = await restoreLastVault(abort.signal)
        if (restored.status === 'opened') {
          opened = true
          onVaultReady(restored.session)
        } else if (restored.status === 'needs-permission' && !abort.signal.aborted) {
          setPendingFolder({ name: restored.folderName, reconnect: restored.reconnect })
        }
      } catch (e) {
        if (!abort.signal.aborted) {
          const msg =
            e instanceof Error
              ? e.message
              : 'Could not access local storage. Try a Chromium-based browser with OPFS support.'
          setError(msg)
        }
      } finally {
        if (!opened && !abort.signal.aborted) setLoading(false)
      }
    }
    void boot()
    return () => abort.abort()
  }, [onVaultReady])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onVaultReady(await createBrowserVault(name))
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
      const session = await openFolderVault()
      if (session) onVaultReady(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open folder')
    } finally {
      setBusy(false)
    }
  }

  async function handleReconnect() {
    if (!pendingFolder) return
    setBusy(true)
    setError(null)
    try {
      const session = await pendingFolder.reconnect()
      setPendingFolder(null)
      onVaultReady(session)
    } catch (e) {
      setPendingFolder(null)
      setError(
        e instanceof Error ? e.message : 'Could not reconnect — please open the folder again.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleOpen(path: string) {
    setBusy(true)
    setError(null)
    try {
      onVaultReady(await openBrowserVault(path))
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
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-16">
      {onShowAbout && (
        <button
          type="button"
          onClick={onShowAbout}
          className="text-fg-muted hover:text-fg hover:bg-bg-hover absolute top-4 right-4 rounded-lg p-2 transition-colors"
          aria-label="About Mentis"
        >
          <Info className="size-5" strokeWidth={1.5} />
        </button>
      )}
      <div className="w-full max-w-md">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="bg-accent-light text-accent mb-4 flex size-16 items-center justify-center rounded-2xl">
            <Brain className="size-9" strokeWidth={1.5} aria-hidden />
          </div>
          <h1 className="text-fg text-3xl font-bold tracking-tight">Mentis</h1>
          <p className="text-fg-muted mt-1 text-xs font-medium tracking-wide uppercase">
            an app by Marrow Group
          </p>
          <p className="text-fg-secondary mt-4 text-sm leading-relaxed">Local first</p>
        </div>

        {error && (
          <div
            className="border-danger/30 bg-danger/5 text-danger mb-6 rounded-lg border px-4 py-3 text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        {pendingFolder && (
          <div className="bg-accent/5 border-accent/30 mb-8 rounded-lg border p-4">
            <p className="text-fg text-sm font-medium">
              Reconnect to <span className="font-semibold">{pendingFolder.name}</span>?
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
                  setPendingFolder(null)
                  void forgetLastVault()
                }}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreate} className="mb-10 space-y-4">
          <label className="block">
            <span className="text-fg-secondary mb-1.5 block text-center text-xs font-medium tracking-wide uppercase">
              New vault
            </span>
            <input
              type="text"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              placeholder="Vault name"
              className="border-border-strong focus:border-accent focus:ring-accent/20 bg-bg text-fg placeholder:text-fg-muted w-full rounded-lg border px-3 py-2.5 text-center text-sm shadow-sm focus:ring-2 focus:outline-none"
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

        {canOpenFolder() && (
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
            <p className="text-fg-muted mt-2 text-center text-xs">Chromium only</p>
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
