import type {
  ChatMessage,
  ChatPick,
  ChatSettings,
  ChatThreadSummary,
  ChatUsage,
} from '@/types/chat'
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
export function contextUse(messages: ChatMessage[], summary?: ChatThreadSummary): ContextUse {
  // With a summary, only what came after it counts, and an answer counted before it
  // carried the whole conversation, so it no longer says anything.
  const cut = summary ? messages.findIndex((m) => m.id === summary.upToMessageId) + 1 : 0
  const kept = messages.slice(cut)
  let last = -1
  for (let i = kept.length - 1; i >= 0; i--) {
    const m = kept[i]!
    if (m.usage && (!summary || m.createdAt >= summary.createdAt)) {
      last = i
      break
    }
  }
  const counted = last >= 0 ? kept[last]!.usage! : null
  const rest = kept
    .slice(last + 1)
    .filter((m) => !m.error)
    .reduce((n, m) => n + estimateTokens(m.content), 0)
  const base = counted
    ? counted.input + counted.output
    : summary
      ? summary.overhead + estimateTokens(summary.content)
      : 0
  return { used: base + rest, estimated: !counted || rest > 0 }
}

/** Everything the thread has spent, across models. */
export function threadTotals(messages: ChatMessage[], summary?: ChatThreadSummary): ChatUsage {
  return messages.reduce(
    (t, m) => ({
      input: t.input + (m.usage?.input ?? 0),
      output: t.output + (m.usage?.output ?? 0),
    }),
    { input: summary?.usage?.input ?? 0, output: summary?.usage?.output ?? 0 },
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
