import type { IndexSearchFilters } from '@/core/index/protocol'
import type { SearchFilters } from '@/types/search'

/**
 * Turns the calendar days of a date range into instants: the start of the
 * `from` day and the end of the `to` day, in local time. Unparseable dates
 * place no bound.
 */
export function toIndexFilters(filters: SearchFilters): IndexSearchFilters {
  const { dateRange, ...rest } = filters
  const out: IndexSearchFilters = rest
  if (dateRange?.from) {
    const from = new Date(dateRange.from)
    from.setHours(0, 0, 0, 0)
    if (!Number.isNaN(from.getTime())) out.modifiedFrom = from.getTime()
  }
  if (dateRange?.to) {
    const to = new Date(dateRange.to)
    to.setHours(23, 59, 59, 999)
    if (!Number.isNaN(to.getTime())) out.modifiedTo = to.getTime()
  }
  return out
}
