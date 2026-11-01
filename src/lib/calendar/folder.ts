import { CALENDAR_DIR, type VaultConfig } from '@/types/vault'

/** The vault's Calendar folder, vault-relative without slashes. */
export function calendarDir(config?: Pick<VaultConfig, 'calendarFolder'> | null): string {
  return config?.calendarFolder?.replace(/^\/+|\/+$/g, '') || CALENDAR_DIR
}

/** True for a note directly in the Calendar folder `dir`: every one is an event. */
export function isEventPath(path: string, dir: string): boolean {
  const name = path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : ''
  return name !== '' && !name.includes('/') && name.toLowerCase().endsWith('.md')
}
