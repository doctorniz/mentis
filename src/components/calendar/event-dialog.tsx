'use client'

import { useCallback, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useCalendarStore } from '@/stores/calendar'
import { EVENT_COLORS, EVENT_COLOR_DOT } from '@/types/calendar'
import type { CalendarEvent, CalendarEventColor } from '@/types/calendar'
import { toDateStr, toDateTimeStr } from '@/lib/calendar'
import { cn } from '@/utils/cn'

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing event to edit; null = create mode */
  event: CalendarEvent | null
  /** Pre-filled date when creating from a day cell click (YYYY-MM-DD) */
  defaultDate?: string
}

function timeFromDateTimeStr(s: string): string {
  if (!s || !s.includes('T')) return '09:00'
  return s.slice(11, 16) || '09:00'
}

function combineDateAndTime(date: string, time: string): string {
  return `${date}T${time}`
}

export function EventDialog({ open, onOpenChange, event, defaultDate }: EventDialogProps) {
  const { vaultFs } = useVaultSession()
  const addEvent = useCalendarStore((s) => s.addEvent)
  const updateEvent = useCalendarStore((s) => s.updateEvent)
  const removeEvent = useCalendarStore((s) => s.removeEvent)

  const today = toDateStr(new Date())

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [startDate, setStartDate] = useState(defaultDate ?? today)
  const [endDate, setEndDate] = useState(defaultDate ?? today)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(true)
  const [color, setColor] = useState<CalendarEventColor>('violet')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (event) {
      setTitle(event.title)
      setBody(event.body)
      setAllDay(event.allDay)
      setColor(event.color)
      const sd = event.start.slice(0, 10)
      const ed = (event.end || event.start).slice(0, 10)
      setStartDate(sd)
      setEndDate(ed)
      setStartTime(timeFromDateTimeStr(event.start))
      setEndTime(timeFromDateTimeStr(event.end))
    } else {
      setTitle('')
      setBody('')
      setAllDay(true)
      setColor('violet')
      const d = defaultDate ?? today
      setStartDate(d)
      setEndDate(d)
      setStartTime('09:00')
      setEndTime('10:00')
    }
  }, [open, event, defaultDate, today])

  const handleSave = useCallback(async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const start = allDay ? startDate : combineDateAndTime(startDate, startTime)
      const end = allDay ? endDate : combineDateAndTime(endDate, endTime)
      const finalEnd = end < start ? start : end

      if (event) {
        await updateEvent(vaultFs, event.path, {
          title: title.trim(),
          start,
          end: finalEnd,
          allDay,
          color,
          body,
        })
      } else {
        await addEvent(vaultFs, {
          title: title.trim(),
          start,
          end: finalEnd,
          allDay,
          color,
          body,
        })
      }
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }, [title, body, startDate, endDate, startTime, endTime, allDay, color, event, vaultFs, addEvent, updateEvent, onOpenChange])

  const handleDelete = useCallback(async () => {
    if (!event) return
    await removeEvent(vaultFs, event.path)
    onOpenChange(false)
  }, [event, vaultFs, removeEvent, onOpenChange])

  const isEdit = Boolean(event)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="bg-bg border-border fixed top-1/2 left-1/2 z-50 flex max-h-[min(90dvh,40rem)] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border shadow-xl"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void handleSave()
            }
          }}
        >
          {/* Header */}
          <div className="border-border flex shrink-0 items-center justify-between border-b px-5 py-3">
            <Dialog.Title className="text-fg text-sm font-semibold">
              {isEdit ? 'Edit Event' : 'New Event'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="text-fg-muted hover:text-fg rounded-md p-1">
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              autoFocus
              className="text-fg placeholder:text-fg-muted/40 w-full bg-transparent text-lg font-semibold outline-none"
            />

            {/* Color swatches */}
            <div>
              <label className="text-fg-secondary mb-1.5 block text-xs font-medium">Color</label>
              <div className="flex gap-2">
                {EVENT_COLORS.map(({ value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setColor(value)}
                    className={cn(
                      'size-6 rounded-full transition-all',
                      EVENT_COLOR_DOT[value],
                      color === value
                        ? 'ring-2 ring-offset-2 ring-offset-bg ring-current scale-110'
                        : 'opacity-60 hover:opacity-100',
                    )}
                    aria-label={value}
                  />
                ))}
              </div>
            </div>

            {/* All-day toggle */}
            <div className="flex items-center justify-between">
              <label className="text-fg-secondary text-xs font-medium">All-day</label>
              <button
                type="button"
                role="switch"
                aria-checked={allDay}
                onClick={() => setAllDay((v) => !v)}
                className={cn(
                  'inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors border border-transparent',
                  allDay ? 'bg-accent' : 'bg-bg-tertiary border-border',
                )}
              >
                <span
                  className={cn(
                    'size-4 rounded-full bg-white shadow transition-transform duration-200',
                    allDay ? 'translate-x-6' : 'translate-x-0',
                  )}
                />
              </button>
            </div>

            {/* Date / time rows */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="min-w-0">
                <label className="text-fg-secondary mb-1 block text-xs font-medium">Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    if (endDate < e.target.value) setEndDate(e.target.value)
                  }}
                  className="border-border bg-bg-secondary text-fg min-w-0 w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent/40"
                />
              </div>
              <div className="min-w-0">
                <label className="text-fg-secondary mb-1 block text-xs font-medium">End date</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border-border bg-bg-secondary text-fg min-w-0 w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent/40"
                />
              </div>
              {!allDay && (
                <>
                  <div className="min-w-0">
                    <label className="text-fg-secondary mb-1 block text-xs font-medium">Start time</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="border-border bg-bg-secondary text-fg min-w-0 w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent/40"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="text-fg-secondary mb-1 block text-xs font-medium">End time</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="border-border bg-bg-secondary text-fg min-w-0 w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent/40"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Notes */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notes…"
              rows={3}
              className="border-border bg-bg-secondary text-fg placeholder:text-fg-muted/40 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent/40"
            />
          </div>

          {/* Footer */}
          <div className="border-border flex shrink-0 items-center justify-between border-t px-5 py-3">
            {isEdit ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="text-danger border-danger/30 hover:bg-danger/10 focus-visible:ring-danger/35 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <Trash2 className="size-3.5 shrink-0" />
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm">Cancel</Button>
              </Dialog.Close>
              <Button size="sm" onClick={() => void handleSave()} disabled={saving || !title.trim()}>
                {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                {isEdit ? 'Save' : 'Create'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
