import { useEffect, useState } from 'react'
import {
  APP_STATE_PREFIX,
  clearDropboxOAuthSession,
  readDropboxOAuthSession,
} from '@/lib/sync/oauth-session'

/**
 * Dropbox OAuth redirect target, served at /auth/dropbox.
 *
 * Framework-free port of the former app/auth/dropbox/page.tsx: `useSearchParams`
 * becomes a URLSearchParams read, `router.replace('/')` becomes
 * `location.replace('/')`, and next/link becomes a plain anchor. Both land on a
 * freshly mounted AppRoot, which starts with no vault session either way.
 */
export function DropboxCallback() {
  const [message, setMessage] = useState('Completing Dropbox sign-in…')
  const [appLink, setAppLink] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    // Started by the phone app: hand the answer back to it (Inbox.kt).
    if (params.get('state')?.startsWith(APP_STATE_PREFIX)) {
      const link = `mentis://auth/dropbox?${params.toString()}`
      setAppLink(link)
      setMessage('Return to Mentis to finish connecting Dropbox.')
      window.location.href = link
      return
    }
    const code = params.get('code')
    const err = params.get('error')
    const errDesc = params.get('error_description')

    void (async () => {
      if (err) {
        const raw = errDesc ?? err
        try {
          setMessage(decodeURIComponent(raw))
        } catch {
          setMessage(raw)
        }
        clearDropboxOAuthSession()
        return
      }
      if (!code) {
        setMessage(
          'Missing authorization code. Close this tab and use Settings → Sync → Connect again.',
        )
        return
      }

      const pending = readDropboxOAuthSession()
      if (!pending?.vaultId) {
        setMessage(
          'Missing sync session data. Open Mentis, go to Settings → Sync, and click Connect Dropbox again.',
        )
        return
      }

      const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID ?? ''
      if (!clientId) {
        setMessage('NEXT_PUBLIC_DROPBOX_CLIENT_ID is not set in this build.')
        return
      }

      const redirectUri = `${window.location.origin}/auth/dropbox`
      try {
        const { DropboxProvider } = await import('@/lib/sync/providers/dropbox')
        const dbx = new DropboxProvider({
          clientId,
          vaultId: pending.vaultId,
          remoteRoot: pending.remoteRoot,
        })
        await dbx.handleAuthCallback(code, redirectUri)
        clearDropboxOAuthSession()
        window.location.replace('/')
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [])

  return (
    <div className="bg-bg text-fg flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <p className="text-center text-sm">{message}</p>
      {appLink ? (
        <a
          href={appLink}
          className="bg-accent text-accent-fg rounded-md px-4 py-2 text-sm font-medium"
        >
          Open Mentis
        </a>
      ) : !message.startsWith('Completing') && (
        // A full page load is correct here: it lands on a freshly mounted AppRoot.
        <a href="/" className="text-accent text-sm font-medium underline underline-offset-2">
          Back to Mentis
        </a>
      )}
    </div>
  )
}
