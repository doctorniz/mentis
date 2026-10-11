import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, Loader2, Plus } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { SectionEditor } from '@/components/journal/section-editor'
import {
  defaultJournalTab,
  journalPath,
  openOrCreateJournal,
  readJournalTemplate,
} from '@/lib/journal'
import {
  joinJournal,
  journalTabs,
  NOTES_TAB,
  setTabContent,
  splitJournal,
  tabContent,
} from '@/lib/journal/sections'
import { dailyNoteTitle } from '@/lib/notes/daily-note'
import { fillTemplate } from '@/lib/notes/template-vars'
import { formatLocalDate } from '@/lib/tasks/recurrence'
import { HOME_VIEW } from '@/core/registries/views'
import { useEditorStore } from '@/stores/editor'
import { useJournalStore } from '@/stores/journal'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import { toast } from '@/stores/toast'
import { DEFAULT_VAULT_CONFIG } from '@/types/vault'
import { cn } from '@/utils/cn'

const SAVE_DEBOUNCE = 500

const dayFrom = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}
const shift = (date: string, days: number) => {
  const d = dayFrom(date)
  d.setDate(d.getDate() + days)
  return formatLocalDate(d)
}

interface Day {
  path: string
  /** The file's text, or null when the day has not been written yet. */
  raw: string | null
  /** What an unwritten day will start as: the journal template, filled. Shown, not saved. */
  preview: string
  tabs: string[]
}

/**
 * A day's journal as tabs: its `##` sections (or, for a day not written yet,
 * the journal template's). Each tab edits only its section; saving re-reads
 * the file and replaces just that section. A day open in a note tab is shown
 * read-only, so the two editors cannot overwrite each other.
 */
export function JournalView() {
  const { vaultFs } = useVaultSession()
  const config = useVaultStore((s) => s.config) ?? DEFAULT_VAULT_CONFIG
  const date = useJournalStore((s) => s.date)
  const requestedTab = useJournalStore((s) => s.tab)
  const setDate = useJournalStore((s) => s.setDate)
  const setRequestedTab = useJournalStore((s) => s.setTab)
  const openInTab = useEditorStore((s) =>
    s.tabs.find((t) => t.path === journalPath(config, dayFrom(date))),
  )
  const [day, setDay] = useState<Day | null>(null)
  const [tab, setTab] = useState<string | null>(null)
  const [addingTab, setAddingTab] = useState(false)
  const [newTab, setNewTab] = useState('')
  const pending = useRef<{ tab: string; markdown: string } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    const path = journalPath(config, dayFrom(date))
    const raw = (await vaultFs.exists(path)) ? await vaultFs.readTextFile(path) : null
    const template = await readJournalTemplate(vaultFs, config)
    const preview = template
      ? fillTemplate(template.body, { date: dayFrom(date), title: dailyNoteTitle(dayFrom(date)) })
      : ''
    const tabs =
      raw !== null
        ? journalTabs(splitJournal(raw))
        : template?.tabs.length
          ? template.tabs
          : [NOTES_TAB]
    return { day: { path, raw, preview, tabs }, defaultTab: defaultJournalTab(raw, template) }
  }, [vaultFs, config, date])

  useEffect(() => {
    let cancelled = false
    setDay(null)
    void load()
      .then(({ day, defaultTab }) => {
        if (cancelled) return
        setDay(day)
        const wanted = requestedTab && day.tabs.includes(requestedTab) ? requestedTab : defaultTab
        setTab(day.tabs.includes(wanted) ? wanted : (day.tabs[0] ?? NOTES_TAB))
      })
      .catch((err) => {
        console.error('Failed to open the journal', err)
        toast.error('Could not open the journal')
      })
    return () => {
      cancelled = true
    }
    // requestedTab is read once per day; switching tabs inside the day does not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  /** Write the pending change: re-read the day (creating it if needed), replace one tab. */
  const save = useCallback(async () => {
    saveTimer.current = null
    const change = pending.current
    pending.current = null
    if (!change) return
    try {
      const path = await openOrCreateJournal(vaultFs, dayFrom(date), config)
      const raw = await vaultFs.readTextFile(path)
      const next = joinJournal(setTabContent(splitJournal(raw), change.tab, change.markdown))
      await vaultFs.writeTextFile(path, next)
      setDay((d) => (d ? { ...d, raw: next } : d))
      window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    } catch (err) {
      console.error('Failed to save the journal', err)
      toast.error('Could not save the journal')
    }
  }, [vaultFs, date, config])

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      void save()
    }
  }, [save])

  // Changing day, or leaving, writes what is pending first.
  useEffect(() => flush, [flush])

  function onChange(markdown: string) {
    if (!tab) return
    pending.current = { tab, markdown }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void save(), SAVE_DEBOUNCE)
  }

  function switchTab(next: string) {
    flush()
    setTab(next)
    setRequestedTab(next)
  }

  function goTo(next: string) {
    flush()
    setDate(next)
  }

  async function addTab() {
    const name = newTab.trim().replace(/^#+\s*/, '')
    setAddingTab(false)
    setNewTab('')
    if (!name || !day) return
    if (day.tabs.some((t) => t.toLowerCase() === name.toLowerCase())) {
      switchTab(day.tabs.find((t) => t.toLowerCase() === name.toLowerCase())!)
      return
    }
    flush()
    pending.current = { tab: name, markdown: '' }
    await save()
    setDay((d) => (d ? { ...d, tabs: [...d.tabs, name] } : d))
    setTab(name)
  }

  async function openAsNote() {
    flush()
    const path = await openOrCreateJournal(vaultFs, dayFrom(date), config)
    useEditorStore.getState().setPendingVaultOpenPath(path)
    useUiStore.getState().setVaultMode('tree')
    useUiStore.getState().setActiveView(HOME_VIEW)
  }

  const today = formatLocalDate(new Date())
  const locked = !!openInTab
  // An unwritten day shows what it will start as, so the first save keeps the template's text.
  const markdown = day && tab ? tabContent(splitJournal(day.raw ?? day.preview), tab) : ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border bg-bg-secondary flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <button
          type="button"
          onClick={() => goTo(shift(date, -1))}
          aria-label="Previous day"
          className="text-fg-secondary hover:text-fg rounded p-1"
        >
          <ChevronLeft className="size-4" />
        </button>
        <h1 className="text-fg text-sm font-semibold">{dailyNoteTitle(dayFrom(date))}</h1>
        <button
          type="button"
          onClick={() => goTo(shift(date, 1))}
          aria-label="Next day"
          className="text-fg-secondary hover:text-fg rounded p-1"
        >
          <ChevronRight className="size-4" />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && goTo(e.target.value)}
          aria-label="Go to day"
          className="border-border bg-bg text-fg rounded-md border px-2 py-0.5 text-xs"
        />
        {date !== today && (
          <button
            type="button"
            onClick={() => goTo(today)}
            className="text-accent rounded px-2 py-0.5 text-xs hover:underline"
          >
            Today
          </button>
        )}
        <button
          type="button"
          onClick={() => void openAsNote()}
          className="text-fg-secondary hover:text-fg ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs"
        >
          <FileText className="size-3.5" /> Open as note
        </button>
      </div>

      {!day || !tab ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="text-fg-muted size-6 animate-spin" />
        </div>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Journal tabs"
            className="border-border flex items-center gap-1 overflow-x-auto border-b px-4"
          >
            {day.tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={t === tab}
                onClick={() => switchTab(t)}
                className={cn(
                  'relative shrink-0 px-3 py-2 text-sm transition-colors',
                  t === tab
                    ? 'text-fg after:bg-accent font-medium after:absolute after:inset-x-0 after:bottom-0 after:h-[2px]'
                    : 'text-fg-secondary hover:text-fg',
                )}
              >
                {t}
              </button>
            ))}
            {!locked &&
              (addingTab ? (
                <input
                  autoFocus
                  value={newTab}
                  onChange={(e) => setNewTab(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addTab()
                    if (e.key === 'Escape') setAddingTab(false)
                  }}
                  onBlur={() => void addTab()}
                  placeholder="Tab name"
                  aria-label="New tab name"
                  className="border-border bg-bg text-fg w-32 rounded-md border px-2 py-0.5 text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingTab(true)}
                  aria-label="Add a tab"
                  className="text-fg-muted hover:text-fg rounded p-1"
                >
                  <Plus className="size-4" />
                </button>
              ))}
          </div>

          {locked && (
            <div className="bg-accent/5 text-fg-secondary flex items-center gap-2 px-4 py-2 text-xs">
              This day is open in a note tab, so it is read-only here.
              <button
                type="button"
                onClick={() => {
                  useEditorStore.getState().setActiveTab(openInTab!.id)
                  useUiStore.getState().setActiveView(HOME_VIEW)
                }}
                className="text-accent hover:underline"
              >
                Go to the note
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <SectionEditor
              key={`${date}/${tab}/${locked}`}
              markdown={markdown}
              onChange={onChange}
              editable={!locked}
              placeholder={`Write in ${tab}…`}
              journalPath={day.path}
            />
          </div>
        </>
      )}
    </div>
  )
}
