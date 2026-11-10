import { contextUse, formatTokens, threadTotals } from '@/lib/chat/usage'
import type { ChatMessage } from '@/types/chat'
import { cn } from '@/utils/cn'

interface ContextMeterProps {
  messages: ChatMessage[]
  /** Tokens the model takes in; undefined where not known. */
  window: number | undefined
  className?: string
}

/** How much of the model's context the conversation takes, and what it has spent. */
export function ContextMeter({ messages, window, className }: ContextMeterProps) {
  const { used, estimated } = contextUse(messages)
  const totals = threadTotals(messages)
  const share = window ? Math.min(1, used / window) : 0
  const label = `${estimated && used > 0 ? '~' : ''}${formatTokens(used)}${
    window ? ` / ${formatTokens(window)}` : ' tokens'
  }`
  const spent =
    totals.input + totals.output > 0
      ? ` Thread so far: ${totals.input.toLocaleString()} in, ${totals.output.toLocaleString()} out.`
      : ''

  return (
    <div
      data-testid="context-meter"
      title={
        (window
          ? `${used.toLocaleString()} of ${window.toLocaleString()} tokens of context (${Math.round(share * 100)}%).`
          : `${used.toLocaleString()} tokens of context. This model's window is not known; set it in Settings › AI.`) +
        spent
      }
      className={cn(
        'text-fg-muted flex shrink-0 items-center gap-1.5 text-xs tabular-nums',
        className,
      )}
    >
      {window ? (
        <span
          role="meter"
          aria-label="Context used"
          aria-valuemin={0}
          aria-valuemax={window}
          aria-valuenow={Math.min(used, window)}
          className="bg-bg-muted h-1.5 w-14 overflow-hidden rounded-full"
        >
          <span
            className={cn('block h-full rounded-full', share > 0.8 ? 'bg-danger' : 'bg-accent')}
            style={{ width: `${Math.max(share * 100, used > 0 ? 3 : 0)}%` }}
          />
        </span>
      ) : null}
      <span>{label}</span>
    </div>
  )
}
