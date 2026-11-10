import type { ChatThreadSummary } from '@/types/chat'

/** A thin rule where older messages were condensed; hover shows the summary. */
export function SummaryMarker({ summary }: { summary: ChatThreadSummary }) {
  return (
    <div
      data-testid="summary-marker"
      title={summary.content}
      className="text-fg-muted flex items-center gap-2 px-3 py-2 font-sans text-[11px]"
    >
      <span className="bg-border h-px flex-1" />
      <span>Earlier messages summarised</span>
      <span className="bg-border h-px flex-1" />
    </div>
  )
}
