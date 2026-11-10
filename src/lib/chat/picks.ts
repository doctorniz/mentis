import type { ChatPick, ChatSettings } from '@/types/chat'
import { providerMeta } from '@/lib/chat/providers/meta'

export const samePick = (a: ChatPick, b: ChatPick) =>
  a.provider === b.provider && a.model === b.model

/** One string for a `<select>` value. Provider ids hold no `|`. */
export const pickValue = (p: ChatPick) => `${p.provider}|${p.model}`

export function parsePickValue(v: string): ChatPick | null {
  const i = v.indexOf('|')
  if (i < 1) return null
  return { provider: v.slice(0, i) as ChatPick['provider'], model: v.slice(i + 1) }
}

/** The settings with `pick` added; it becomes the one in use if none was. */
export function withPick(s: ChatSettings, pick: ChatPick): ChatSettings {
  const picks = s.picks.some((p) => samePick(p, pick)) ? s.picks : [...s.picks, pick]
  const hasCurrent = s.provider && s.model
  return hasCurrent ? { ...s, picks } : { ...s, picks, provider: pick.provider, model: pick.model }
}

/** The settings with `pick` removed; if it was in use, the first pick left is. */
export function withoutPick(s: ChatSettings, pick: ChatPick): ChatSettings {
  const picks = s.picks.filter((p) => !samePick(p, pick))
  if (s.provider !== pick.provider || s.model !== pick.model) return { ...s, picks }
  const next = picks[0]
  return { ...s, picks, provider: next?.provider ?? null, model: next?.model ?? '' }
}

/** Provider name and model, for a thread's header or a picker row. */
export const pickLabel = (p: ChatPick) => `${providerMeta(p.provider).label} · ${p.model}`
