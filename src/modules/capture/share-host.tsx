'use client'

import { lazy, Suspense, useEffect, useState } from 'react'
import { captureDestinations } from '@/core/registries'
import type { CaptureContext, CaptureDestination, ParseResult } from '@/core/registries/capture'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { allocateUniqueFilePath } from '@/lib/notes/new-note'
import { startLaunchInbox, type Entry } from '@/components/shell/launch-inbox'
import { useUiStore } from '@/stores/ui'
import { useJournalStore } from '@/stores/journal'
import { toast } from '@/stores/toast'
import { DEFAULT_VAULT_CONFIG } from '@/types/vault'

const CaptureConfirmDialog = lazy(() => import('./confirm-dialog'))

const URL_RE = /(?:https?:\/\/|www\.)\S+/i

/**
 * The phone app's way in from other apps: what is shared to Mentis, and the
 * shortcuts, widget and tile that open it into capture. As with the capture
 * bar, plain text goes straight to Thoughts (with Undo); a link is a bookmark,
 * shown for confirmation first; images go to the attachments folder.
 */
export default function ShareHost() {
  const { vaultFs, config } = useVaultSession()
  const [confirming, setConfirming] = useState<{
    destination: CaptureDestination
    input: string
    parsed: ParseResult
    ctx: CaptureContext
  } | null>(null)

  useEffect(() => {
    const ctx = (): CaptureContext => ({ vaultFs, scope: {}, now: new Date() })

    async function shareText(text: string, subject?: string) {
      const link = URL_RE.exec(text)?.[0]
      if (link) {
        const destination = captureDestinations.get('bookmark')!
        const full = ctx()
        const parsed = await destination.parse(link, full)
        // The sharing app's subject is usually the page's title.
        if (subject?.trim()) parsed.values.title = subject.trim()
        setConfirming({ destination, input: link, parsed, ctx: full })
        return
      }
      const thought = captureDestinations.get('thought')!
      const full = ctx()
      const parsed = await thought.parse(text, full)
      const result = await thought.write(parsed.values, full)
      if (!result) return
      if (result.undo) {
        const undo = result.undo
        toast.withAction(result.message ?? 'Saved to Thoughts', {
          label: 'Undo',
          run: () => void undo().catch(() => toast.error('Could not undo')),
        })
      } else {
        toast.success(result.message ?? 'Saved to Thoughts')
      }
    }

    async function shareFiles(files: { path: string; name: string }[]) {
      const { invoke } = await import('@tauri-apps/api/core')
      const folder = config.attachmentFolder || DEFAULT_VAULT_CONFIG.attachmentFolder
      if (!(await vaultFs.exists(folder))) await vaultFs.mkdir(folder)
      let saved = 0
      for (const f of files) {
        try {
          const bytes = new Uint8Array(
            await invoke<ArrayBuffer>('inbox_read_file', { path: f.path }),
          )
          // A file of the same name is already there: keep both, never overwrite.
          const dest = await allocateUniqueFilePath(vaultFs, `${folder}/${f.name}`)
          await vaultFs.writeFile(dest, bytes)
          saved++
        } catch (e) {
          console.warn('[share] could not save a shared file:', e)
        }
      }
      window.dispatchEvent(new CustomEvent('ink:vault-changed'))
      if (saved) toast.success(`Saved ${saved} file${saved === 1 ? '' : 's'} to ${folder}`)
      if (saved < files.length) toast.error('Some shared files could not be saved.')
    }

    const onEntry = async (entry: Entry) => {
      switch (entry.type) {
        case 'share-text':
          return shareText(entry.text, entry.subject)
        case 'share-files':
          return shareFiles(entry.files)
        case 'launch':
          if (entry.target === 'journal') useJournalStore.getState().openDay()
          else
            useUiStore.getState().requestCaptureFocus(entry.target === 'task' ? 'tasks' : 'board')
          return
      }
    }
    return startLaunchInbox((entry) =>
      onEntry(entry).catch((e) => {
        console.warn('[share] could not handle', entry.type, e)
        toast.error('Could not save what was shared.')
      }),
    )
  }, [vaultFs, config])

  if (!confirming) return null
  return (
    <Suspense fallback={null}>
      <CaptureConfirmDialog
        {...confirming}
        onSaved={(result) => {
          setConfirming(null)
          toast.success(result.message ?? `Saved to ${confirming.destination.label}`)
        }}
        onCancel={() => setConfirming(null)}
      />
    </Suspense>
  )
}
