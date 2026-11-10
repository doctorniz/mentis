import { useCallback, useEffect, useState } from 'react'
import { fetchModels, type ModelEntry } from '@/lib/chat/providers/model-catalog'
import { providerNeedsApiKey } from '@/lib/chat/providers/meta'
import type { ChatProviderId } from '@/types/chat'

export interface ChatModels {
  models: ModelEntry[]
  loading: boolean
  /** Why the list could not be fetched; the model can still be typed. */
  error: string | null
  refresh: () => void
}

/**
 * The provider's models right now, fetched when `provider`, `apiKey` or
 * `baseUrl` change and on `refresh`. Held in memory only. A provider that
 * needs a key is not asked until there is one.
 *
 * `apiKey` is null while the key is still being read, '' when there is none.
 */
export function useChatModels(
  provider: ChatProviderId | null,
  apiKey: string | null,
  baseUrl: string | undefined,
  enabled = true,
): ChatModels {
  const [models, setModels] = useState<ModelEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setModels([])
    setError(null)
    if (!enabled || !provider || apiKey === null) return
    if (providerNeedsApiKey(provider) && !apiKey) return
    let cancelled = false
    setLoading(true)
    fetchModels(provider, apiKey, baseUrl)
      .then((rows) => {
        if (!cancelled) setModels(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [provider, apiKey, baseUrl, enabled, tick])

  const refresh = useCallback(() => setTick((n) => n + 1), [])
  return { models, loading, error, refresh }
}
