import type { FileSystemAdapter } from '@/lib/fs'
import { saveVaultConfig } from '@/lib/vault'
import { migrateChatSettings } from '@/lib/chat/migrate-settings'
import { useVaultStore } from '@/stores/vault'
import type { ChatPick } from '@/types/chat'

/** Make `pick` the model chat uses, and keep it for the next time. */
export async function choosePick(vaultFs: FileSystemAdapter, pick: ChatPick): Promise<void> {
  const cfg = useVaultStore.getState().config
  if (!cfg) return
  const chat = { ...migrateChatSettings(cfg.chat), provider: pick.provider, model: pick.model }
  await saveVaultConfig(vaultFs, { ...cfg, chat })
  useVaultStore.getState().updateConfig({ chat })
}
