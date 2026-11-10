/**
 * "Test" in Settings: ask the provider for its models. If that works, the
 * address and key are right, and the list is the one to choose from.
 */

import type { ChatProviderId } from '@/types/chat'
import { fetchModels, type ModelEntry } from './model-catalog'

export interface TestResult {
  ok: boolean
  error?: string
  models?: ModelEntry[]
}

export async function testConnection(
  provider: ChatProviderId,
  apiKey: string,
  baseUrl?: string,
): Promise<TestResult> {
  try {
    const models = await fetchModels(provider, apiKey, baseUrl)
    return { ok: true, models }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
