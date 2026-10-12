import type { FileSystemAdapter } from '@/lib/fs/types'
import type { ReminderRow } from '@/core/index/protocol'
import { settleReminders } from './actions'
import { reminderId } from './sources'

/**
 * Snooze and Done chosen on a phone's notification, while the app was closed
 * or in the background. Android keeps them (Reminders.kt) until the app takes
 * them here and writes them into the items' files, as if chosen in the app at
 * the time they were tapped.
 */

interface NotificationAction {
  action: 'done' | 'snooze'
  whenMs: number
  untilMs?: number
  item: { kind: ReminderRow['kind']; path: string; title: string; at: string; vault?: string }
}

/**
 * Take the choices waiting for this vault and write them; the ids of the
 * reminders settled. Choices for another vault are for one not open.
 */
export async function applyNotificationActions(
  vaultFs: FileSystemAdapter,
  vaultKey: string,
): Promise<string[]> {
  const { invoke } = await import('@tauri-apps/api/core')
  const actions = await invoke<NotificationAction[]>('reminders_take_actions')
  const settled: string[] = []
  for (const a of actions) {
    if (a.item.vault && a.item.vault !== vaultKey) continue
    const row: ReminderRow = {
      kind: a.item.kind,
      path: a.item.path,
      title: a.item.title,
      at: a.item.at,
      about: a.item.at,
    }
    await settleReminders(
      vaultFs,
      vaultKey,
      [row],
      a.action === 'done'
        ? { done: true }
        : { done: false, until: new Date(a.untilMs ?? a.whenMs) },
      new Date(a.whenMs),
    )
    settled.push(reminderId(row))
  }
  return settled
}
