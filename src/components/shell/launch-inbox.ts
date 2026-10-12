import type { ReminderRow } from '@/core/index/protocol'

/**
 * What Android asked the phone app to show — kept by the activity until the
 * app is ready (Inbox.kt) and taken here on start and whenever the app comes
 * back to the front.
 */

export type Entry =
  | {
      type: 'open-reminder'
      item: { kind: ReminderRow['kind']; path: string; title: string; at: string }
    }
  | { type: 'share-text'; text: string; subject?: string }
  | { type: 'share-files'; files: { path: string; name: string; mime: string }[] }
  | { type: 'launch'; target: 'capture' | 'task' | 'journal' }

async function take(): Promise<Entry[]> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<Entry[]>('inbox_take')
}

async function handle(entry: Entry, other: (entry: Entry) => Promise<void>): Promise<void> {
  switch (entry.type) {
    case 'open-reminder': {
      const { openReminder } = await import('@/lib/reminders/actions')
      const { item } = entry
      openReminder({
        kind: item.kind,
        path: item.path,
        title: item.title,
        at: item.at,
        about: item.at,
      })
      break
    }
    default:
      await other(entry)
  }
}

/**
 * Start taking the inbox; entries other than a reminder go to `other` (shares
 * and shortcuts, for the capture module). Returns a function that stops it.
 */
export function startLaunchInbox(other: (entry: Entry) => Promise<void>): () => void {
  let busy = false
  const drain = async () => {
    if (busy) return
    busy = true
    try {
      for (const entry of await take()) await handle(entry, other)
    } catch (e) {
      console.warn('[inbox] could not take what Android sent:', e)
    } finally {
      busy = false
    }
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void drain()
  }
  void drain()
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}
