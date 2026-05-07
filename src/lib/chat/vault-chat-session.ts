const LAST_THREAD_PREFIX = 'ink-vault-chat-last-thread:'
const SIDEBAR_PREFIX = 'ink-vault-chat-sidebar:'
const SIDEBAR_COLLAPSED_KEY = 'ink-vault-chat-sidebar-collapsed'

const SIDEBAR_DEFAULT = 260
const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 480

function clampSidebar(n: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, n))
}

export function readVaultChatLastThreadId(vaultPath: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(LAST_THREAD_PREFIX + vaultPath)
  } catch {
    return null
  }
}

export function writeVaultChatLastThreadId(
  vaultPath: string,
  threadId: string,
): void {
  try {
    sessionStorage.setItem(LAST_THREAD_PREFIX + vaultPath, threadId)
  } catch {
    /* noop */
  }
}

/** Clears remembered active thread for this vault (call when vault closes). */
export function clearVaultChatSession(vaultPath: string): void {
  try {
    sessionStorage.removeItem(LAST_THREAD_PREFIX + vaultPath)
  } catch {
    /* noop */
  }
}

export function readVaultChatSidebarWidth(vaultPath: string): number {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT
  try {
    const raw = sessionStorage.getItem(SIDEBAR_PREFIX + vaultPath)
    if (!raw) return SIDEBAR_DEFAULT
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return SIDEBAR_DEFAULT
    return clampSidebar(n)
  } catch {
    return SIDEBAR_DEFAULT
  }
}

export function writeVaultChatSidebarWidth(vaultPath: string, width: number): void {
  try {
    sessionStorage.setItem(SIDEBAR_PREFIX + vaultPath, String(clampSidebar(width)))
  } catch {
    /* noop */
  }
}

export function readVaultChatSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function writeVaultChatSidebarCollapsed(collapsed: boolean): void {
  try {
    sessionStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* noop */
  }
}

export const VAULT_CHAT_SIDEBAR = {
  default: SIDEBAR_DEFAULT,
  min: SIDEBAR_MIN,
  max: SIDEBAR_MAX,
} as const
