import {
  DEFAULT_CHAT_SETTINGS,
  type ChatPick,
  type ChatProviderId,
  type ChatSettings,
} from '@/types/chat'

const KNOWN: readonly string[] = [
  'openrouter',
  'anthropic',
  'openai',
  'gemini',
  'ollama',
  'llamacpp',
]

/**
 * Read a saved `chat` block from `config.json`, which may predate this shape:
 *
 * - no `enabled`: chat stays off until it is switched on;
 * - the on-device model is gone, and with it `device`, `webllm` and
 *   `huggingface`: no provider is chosen;
 * - no `picks`: the chosen model is the only pick;
 * - one `baseUrl` becomes the URL of the provider that was chosen.
 */
export function migrateChatSettings(saved: unknown): ChatSettings {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>
  const provider =
    typeof s.provider === 'string' && KNOWN.includes(s.provider)
      ? (s.provider as ChatProviderId)
      : null

  const baseUrls: Partial<Record<ChatProviderId, string>> = {
    ...((s.baseUrls as Partial<Record<ChatProviderId, string>> | undefined) ?? {}),
  }
  if (typeof s.baseUrl === 'string' && s.baseUrl.trim() && provider && !baseUrls[provider]) {
    baseUrls[provider] = s.baseUrl.trim()
  }

  const model = provider && typeof s.model === 'string' ? s.model : ''
  const picks: ChatPick[] = []
  const add = (p: unknown, m: unknown) => {
    if (typeof p !== 'string' || !KNOWN.includes(p) || typeof m !== 'string' || !m) return
    if (!picks.some((x) => x.provider === p && x.model === m)) {
      picks.push({ provider: p as ChatProviderId, model: m })
    }
  }
  if (Array.isArray(s.picks)) {
    for (const x of s.picks as Array<Record<string, unknown> | null>) add(x?.provider, x?.model)
  }
  add(provider, model)

  const windows: Record<string, number> = {}
  if (s.contextWindows && typeof s.contextWindows === 'object') {
    for (const [k, v] of Object.entries(s.contextWindows as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) windows[k] = Math.round(v)
    }
  }

  return {
    ...DEFAULT_CHAT_SETTINGS,
    enabled: s.enabled === true,
    provider,
    model,
    picks,
    ...(Object.keys(windows).length ? { contextWindows: windows } : {}),
    ...(Object.keys(baseUrls).length ? { baseUrls } : {}),
    ...(typeof s.systemPrompt === 'string' ? { systemPrompt: s.systemPrompt } : {}),
    maxContextChars:
      typeof s.maxContextChars === 'number'
        ? s.maxContextChars
        : DEFAULT_CHAT_SETTINGS.maxContextChars,
  }
}
