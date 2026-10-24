import { ASSETS_DIR, type VaultConfig } from '@/types/vault'

/** The vault's attachment folder, vault-relative without slashes. */
export function attachmentsDir(config?: Pick<VaultConfig, 'attachmentFolder'> | null): string {
  return config?.attachmentFolder?.replace(/^\/+|\/+$/g, '') || ASSETS_DIR
}
