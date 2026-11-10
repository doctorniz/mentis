import { useChatModels } from '@/lib/chat/use-chat-models'
import { contextWindowFor } from '@/lib/chat/usage'
import type { ChatSettings } from '@/types/chat'

/**
 * The window, in tokens, of the model in use: the one typed in Settings, else
 * the provider's own figure; undefined where neither is known. `apiKey` is
 * null while the key is being read.
 */
export function useContextWindow(
  settings: ChatSettings,
  apiKey: string | null,
): number | undefined {
  const { provider, model } = settings
  const pick = provider && model ? { provider, model } : null
  const typed = pick ? contextWindowFor(settings, pick) : undefined
  const { models } = useChatModels(
    provider,
    apiKey,
    provider ? settings.baseUrls?.[provider] : undefined,
    !!pick && typed === undefined,
  )
  if (!pick) return undefined
  return contextWindowFor(settings, pick, models.find((m) => m.id === model)?.contextWindow)
}
