import type { ChatUsage } from '@/types/chat'

/** The tokens one answer took, under it. */
export function UsageLine({ usage }: { usage: ChatUsage | undefined }) {
  if (!usage) return null
  return (
    <p className="text-fg-muted mt-1 font-sans text-[11px] tabular-nums">
      {usage.input.toLocaleString()} in · {usage.output.toLocaleString()} out
    </p>
  )
}
