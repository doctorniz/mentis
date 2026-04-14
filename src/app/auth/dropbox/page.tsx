'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  clearDropboxOAuthSession,
  readDropboxOAuthSession,
} from '@/lib/sync/oauth-session'

function DropboxCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState('Completing Dropbox sign-in…')

  useEffect(() => {
    const code = searchParams.get('code')
    const err = searchParams.get('error')
    const errDesc = searchParams.get('error_description')

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
        setMessage('Missing authorization code. Close this tab and use Settings → Sync → Connect again.')
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
        router.replace('/')
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [searchParams, router])

  return (
    <div className="bg-bg text-fg flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <p className="text-center text-sm">{message}</p>
      {!message.startsWith('Completing') && (
        <Link
          href="/"
          className="text-accent text-sm font-medium underline underline-offset-2"
        >
          Back to Mentis
        </Link>
      )}
    </div>
  )
}

export default function AuthDropboxPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-bg text-fg-muted flex min-h-screen items-center justify-center text-sm">
          Loading…
        </div>
      }
    >
      <DropboxCallbackInner />
    </Suspense>
  )
}
