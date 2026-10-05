import type { SettingsPanelProps } from '@/core/registries/settings'
import { VaultDropboxSyncPanel } from '@/components/views/vault-dropbox-sync-panel'

/** The Sync section of the settings dialog. */
export default function SyncSettingsPanel({ config, update, saveNow }: SettingsPanelProps) {
  return (
    <VaultDropboxSyncPanel
      vaultConfig={config}
      setSync={(sync) => update({ sync })}
      saveFullConfig={saveNow}
      persistSyncFieldsToDisk={false}
    />
  )
}
