import type { ChatMessage, ChatPick, ChatSettings, ChatUsage } from '@/types/chat'
import { pickValue } from '@/lib/chat/picks'

/** A rough count for text not yet counted by a provider: four characters a token. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4)

export interface ContextUse {
  /** Tokens the next request will start from. */
  used: number
  /** True where `used` is counted by us, not the provider. */
  estimated: boolean
}

/**
 * What the conversation takes up. The last answer's counts are the provider's:
 * its request plus its reply is what the next request carries. Anything after
 * it (a cancelled turn, an unanswered question) is estimated.
 */
export function contextUse(messages: ChatMessage[]): ContextUse {
  let last = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.usage) {
      last = i
      break
    }
  }
  const counted = last >= 0 ? messages[last]!.usage! : null
  const rest = messages
    .slice(last + 1)
    .filter((m) => !m.error)
    .reduce((n, m) => n + estimateTokens(m.content), 0)
  return {
    used: (counted ? counted.input + counted.output : 0) + rest,
    estimated: !counted || rest > 0,
  }
}

/** Everything the thread has spent, across models. */
export function threadTotals(messages: ChatMessage[]): ChatUsage {
  return messages.reduce(
    (t, m) => ({
      input: t.input + (m.usage?.input ?? 0),
      output: t.output + (m.usage?.output ?? 0),
    }),
    { input: 0, output: 0 },
  )
}

/** The window typed for this model, else what the provider reported. */
export function contextWindowFor(
  settings: Pick<ChatSettings, 'contextWindows'>,
  pick: ChatPick,
  reported?: number,
): number | undefined {
  return settings.contextWindows?.[pickValue(pick)] ?? reported
}

/** 950 → "950", 12_400 → "12.4k", 200_000 → "200k", 1_000_000 → "1M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) {
    const k = n / 1000
    return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`
  }
  return `${Math.round((n / 1_000_000) * 10) / 10}M`
}
