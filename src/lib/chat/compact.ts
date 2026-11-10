import type { ChatMessage, ChatThreadSummary, ChatUsage } from '@/types/chat'
import type { ChatProvider, WireMessage } from '@/lib/chat/providers/types'
import { contextUse, estimateTokens } from '@/lib/chat/usage'

/** Summarise once the next request would fill more of the window than this. */
export const COMPACT_AT = 0.8

/** The latest messages that always stay word for word. */
export const KEEP_MESSAGES = 4

const SYSTEM = `You condense a conversation so it can continue in less space. Write a summary the assistant can rely on later: what the user wants, what was established, decisions made, names, numbers and open questions. Keep file paths and quoted identifiers exactly as written. No preamble.`

const sentMessages = (messages: ChatMessage[]) => messages.filter((m) => !m.error)

/** The messages a request carries: everything after the summarised ones. */
export function messagesAfterSummary(
  messages: ChatMessage[],
  summary: ChatThreadSummary | undefined,
): ChatMessage[] {
  if (!summary) return messages
  const cut = messages.findIndex((m) => m.id === summary.upToMessageId)
  return messages.slice(cut + 1)
}

/** The summary as an instruction ahead of the kept messages. */
export function summaryWire(summary: ChatThreadSummary | undefined): WireMessage[] {
  return summary
    ? [{ role: 'system', content: `Summary of the earlier conversation:\n\n${summary.content}` }]
    : []
}

/**
 * Where to cut: the last message to summarise, so that the newest few stay and
 * the first one kept is the person's. Null where there is too little to cut.
 */
export function planCut(
  messages: ChatMessage[],
  summary: ChatThreadSummary | undefined,
): ChatMessage | null {
  const from = summary ? messages.findIndex((m) => m.id === summary.upToMessageId) + 1 : 0
  for (let c = messages.length - KEEP_MESSAGES - 1; c >= from; c--) {
    if (messages[c + 1]?.role === 'user') return messages[c]!
  }
  return null
}

/** Whether the request for `nextText` would pass the line, and there is something to cut. */
export function needsCompaction(
  messages: ChatMessage[],
  summary: ChatThreadSummary | undefined,
  window: number | undefined,
  nextText: string,
): boolean {
  if (!window) return false
  const projected = contextUse(messages, summary).used + estimateTokens(nextText)
  return projected > window * COMPACT_AT && planCut(messages, summary) !== null
}

const transcript = (messages: ChatMessage[]) =>
  messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')

interface CompactArgs {
  provider: ChatProvider
  model: string
  apiKey: string
  baseUrl?: string
  messages: ChatMessage[]
  summary: ChatThreadSummary | undefined
  signal?: AbortSignal
}

/**
 * Ask the model for a summary of everything before the cut, folding in the
 * earlier summary. Returns the new summary, or null where there is nothing to
 * cut; throws if the provider fails.
 */
export async function compactThread(args: CompactArgs): Promise<ChatThreadSummary | null> {
  const { provider, messages, summary } = args
  const upTo = planCut(messages, summary)
  if (!upTo) return null
  const upToIdx = messages.indexOf(upTo)
  const from = summary ? messages.findIndex((m) => m.id === summary.upToMessageId) + 1 : 0
  const older = sentMessages(messages.slice(from, upToIdx + 1))

  const body = [
    summary ? `Earlier summary:\n\n${summary.content}` : '',
    `Conversation to fold in:\n\n${transcript(older)}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  let content = ''
  let usage: ChatUsage | undefined
  for await (const chunk of provider.streamChat({
    model: args.model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: body },
    ],
    apiKey: args.apiKey,
    baseUrl: args.baseUrl,
    signal: args.signal,
  })) {
    if (chunk.type === 'delta') content += chunk.content
    else if (chunk.type === 'usage') usage = { input: chunk.input, output: chunk.output }
    else if (chunk.type === 'error') throw new Error(chunk.message)
  }
  content = content.trim()
  if (!content) return null

  // What every request carries besides the conversation: the instructions and the
  // document or excerpts. The last counted request, less the conversation it held.
  const counted = [...messages].reverse().find((m) => m.usage)
  const heldBefore = counted ? sentMessages(messages.slice(from, messages.indexOf(counted))) : []
  const overhead = counted
    ? Math.max(
        0,
        counted.usage!.input -
          heldBefore.reduce((n, m) => n + estimateTokens(m.content), 0) -
          (summary ? estimateTokens(summary.content) : 0),
      )
    : (summary?.overhead ?? 0)

  return {
    content,
    upToMessageId: upTo.id,
    overhead,
    createdAt: new Date().toISOString(),
    ...(usage ? { usage } : {}),
  }
}
