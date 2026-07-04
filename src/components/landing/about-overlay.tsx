'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Brush,
  Calendar,
  ChevronDown,
  FileText,
  Globe,
  Kanban,
  LayoutGrid,
  Link2,
  MessageSquare,
  Mic,
  Network,
  Presentation,
  Search,
  Shield,
  Bookmark,
  ListTodo,
} from 'lucide-react'
import { cn } from '@/utils/cn'

/* ------------------------------------------------------------------ */
/*  Accordion primitive (headless, no dependency)                      */
/* ------------------------------------------------------------------ */

function AccordionItem({
  icon: Icon,
  iconColor,
  title,
  children,
}: {
  icon: React.ElementType
  iconColor?: string
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-border border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-bg-hover flex w-full items-center gap-3 px-5 py-4 text-left transition-colors"
      >
        <Icon className={cn('size-5 shrink-0', iconColor ?? 'text-accent')} strokeWidth={1.5} />
        <span className="text-fg flex-1 text-sm font-medium">{title}</span>
        <ChevronDown
          className={cn(
            'text-fg-muted size-4 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="text-fg-secondary space-y-2 px-5 pb-5 pl-13 text-sm leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Feature data                                                       */
/* ------------------------------------------------------------------ */

const FEATURES: {
  icon: React.ElementType
  iconColor?: string
  title: string
  content: React.ReactNode
}[] = [
  {
    icon: FileText,
    title: 'Markdown Notes',
    content: (
      <>
        <p>
          A full WYSIWYG editor that renders Markdown live, with a toggle to raw source view.
          Supports GFM tables, task lists, math (KaTeX), code blocks with syntax highlighting,
          slash commands, and drag-and-drop image embeds.
        </p>
        <p>
          Every note is a plain <code className="text-accent text-xs">.md</code> file — open your
          vault in any text editor or sync it with any tool.
        </p>
      </>
    ),
  },
  {
    icon: Link2,
    title: 'Wiki-Links & Backlinks',
    content: (
      <p>
        Link between notes with{' '}
        <code className="text-accent text-xs">{'[[note-name]]'}</code> syntax.
        Autocomplete suggestions appear as you type. A backlinks panel shows every note that
        references the current one.
      </p>
    ),
  },
  {
    icon: BookOpen,
    title: 'PDF Viewer & Editor',
    content: (
      <>
        <p>
          Import, view, annotate, highlight, draw, sign, and manage PDFs as first-class citizens.
          All edits are written directly into the PDF file — one file, one source of truth.
        </p>
        <p>
          Page operations include insert, delete, rotate, reorder, merge, and split. Form filling,
          find-in-document, and version snapshots are built in.
        </p>
      </>
    ),
  },
  {
    icon: Brush,
    title: 'Canvas Drawing',
    content: (
      <>
        <p>
          A raster-first, layer-based drawing surface powered by PixiJS. Infinite pan and zoom,
          pressure-sensitive brushes, eraser, fill, and eyedropper tools.
        </p>
        <p>
          Each canvas supports multiple layers with opacity, visibility, locking, and blend modes.
          Export to PNG or PDF.
        </p>
      </>
    ),
  },
  {
    icon: LayoutGrid,
    title: 'Board',
    content: (
      <p>
        A quick-capture notice board for thoughts, images, and voice recordings. Masonry layout
        with inline editing. Audio thoughts can be transcribed offline using Whisper. Move any item
        to the vault when it matures.
      </p>
    ),
  },
  {
    icon: Mic,
    title: 'Voice Notes',
    content: (
      <p>
        Record voice memos as MP3 directly in the app. Transcription runs entirely in the browser
        via Whisper — no data leaves your device. Audio files play back with speed controls and
        seeking.
      </p>
    ),
  },
  {
    icon: ListTodo,
    title: 'Tasks',
    content: (
      <p>
        A local-first task manager with priorities, due dates, tags, subtasks, and recurring
        tasks. Natural language quick-add understands phrases like &quot;!1 #work &gt;tomorrow&quot;.
        Export to iCalendar format.
      </p>
    ),
  },
  {
    icon: Calendar,
    title: 'Calendar',
    content: (
      <p>
        Day, week, and month views for events stored as Markdown files. Tasks with due dates
        surface automatically. Color-coded events with all-day and timed support.
      </p>
    ),
  },
  {
    icon: Kanban,
    title: 'Kanban Boards',
    content: (
      <p>
        Any Markdown file with{' '}
        <code className="text-accent text-xs">type: kanban</code> frontmatter renders as a
        drag-and-drop board. Columns are headings, cards are checklist items. The file stays a
        readable <code className="text-accent text-xs">.md</code> everywhere else.
      </p>
    ),
  },
  {
    icon: Bookmark,
    title: 'Bookmarks',
    content: (
      <p>
        Save and organise web bookmarks with automatic OpenGraph metadata scraping — titles,
        descriptions, favicons, and preview images. Categorise with folders, filter by tags.
      </p>
    ),
  },
  {
    icon: Presentation,
    title: 'Presentations',
    content: (
      <p>
        Open and edit PowerPoint (<code className="text-accent text-xs">.pptx</code>) files
        inline with a ribbon UI for text, shapes, images, and slide management. Auto-saves edits
        back to the vault.
      </p>
    ),
  },
  {
    icon: MessageSquare,
    title: 'AI Chat',
    content: (
      <>
        <p>
          Bring your own LLM — supports OpenRouter, OpenAI, Anthropic, Gemini, Ollama, and a
          fully offline local model (Gemma). Chat per-document or across the entire vault with
          RAG-powered context.
        </p>
        <p>
          API keys are stored locally and never leave your device.
        </p>
      </>
    ),
  },
  {
    icon: Search,
    title: 'Full-Text Search',
    content: (
      <p>
        Instant search across all notes, PDFs, and canvases with fuzzy matching, tag filters,
        date ranges, folder prefixes, and file-type filters. Index updates incrementally on every
        save.
      </p>
    ),
  },
  {
    icon: Network,
    title: 'Graph View',
    content: (
      <p>
        An interactive force-directed graph showing connections between notes, PDFs, and canvases
        via wiki-links. Click any node to open the file. Filter by folder.
      </p>
    ),
  },
  {
    icon: Globe,
    title: 'Cloud Sync',
    iconColor: 'text-fg-tertiary',
    content: (
      <p>
        Optional Dropbox sync keeps your vault in the cloud. SHA-256 change detection with
        last-write-wins conflict resolution. Or point your vault folder at any cloud-synced
        directory.
      </p>
    ),
  },
]

/* ------------------------------------------------------------------ */
/*  Main overlay                                                       */
/* ------------------------------------------------------------------ */

export function AboutOverlay({ onBack }: { onBack: () => void }) {
  return (
    <div className="bg-bg-secondary flex min-h-screen flex-col">
      {/* Top bar */}
      <div className="border-border sticky top-0 z-10 flex items-center gap-3 border-b bg-bg-secondary/80 px-4 py-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={onBack}
          className="hover:bg-bg-hover text-fg-secondary hover:text-fg -ml-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-10">
          {/* Hero */}
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="bg-accent-light text-accent mb-4 flex size-14 items-center justify-center rounded-2xl">
              <Brain className="size-8" strokeWidth={1.5} aria-hidden />
            </div>
            <h1 className="text-fg text-2xl font-bold tracking-tight">Mentis</h1>
            <p className="text-fg-muted mt-1 text-xs font-medium tracking-wide uppercase">
              by Marrow Group
            </p>
          </div>

          {/* Purpose */}
          <section className="mb-10">
            <h2 className="text-fg mb-3 text-lg font-semibold">What is Mentis?</h2>
            <p className="text-fg-secondary text-sm leading-relaxed">
              Mentis is a <strong className="text-fg font-medium">local-first</strong>,
              offline-capable workspace for notes, documents, and creative work. Every file you
              create — Markdown notes, PDFs, drawings, tasks — lives on your device as a plain
              file you fully own. No account required, no cloud dependency, no lock-in.
            </p>
          </section>

          {/* Primary use */}
          <section className="mb-10">
            <h2 className="text-fg mb-3 text-lg font-semibold">Primary use</h2>
            <p className="text-fg-secondary text-sm leading-relaxed">
              A single place to write, think, and organise knowledge. Open or create a{' '}
              <strong className="text-fg font-medium">vault</strong> — a folder on your
              device — and everything lives inside it: notes in Markdown, annotated PDFs,
              freehand drawings, tasks, bookmarks, and more. Switch between a file tree, a
              visual graph of connections, or a quick-capture board depending on how you work.
            </p>
          </section>

          {/* Scope & secondary uses */}
          <section className="mb-10">
            <h2 className="text-fg mb-3 text-lg font-semibold">Scope &amp; secondary uses</h2>
            <div className="text-fg-secondary space-y-3 text-sm leading-relaxed">
              <p>
                While note-taking is the core, Mentis doubles as:
              </p>
              <ul className="list-inside list-disc space-y-1.5 pl-1">
                <li>
                  <strong className="text-fg font-medium">PDF editor</strong> — annotate,
                  highlight, sign, fill forms, merge, split, and reorder pages.
                </li>
                <li>
                  <strong className="text-fg font-medium">Drawing canvas</strong> — pressure-
                  sensitive, layer-based raster art with infinite zoom.
                </li>
                <li>
                  <strong className="text-fg font-medium">Task manager</strong> — priorities,
                  due dates, recurring tasks, and natural language quick-add.
                </li>
                <li>
                  <strong className="text-fg font-medium">Bookmark organiser</strong> — save
                  web links with auto-fetched metadata.
                </li>
                <li>
                  <strong className="text-fg font-medium">Voice recorder</strong> — MP3
                  recording with offline Whisper transcription.
                </li>
                <li>
                  <strong className="text-fg font-medium">Presentation viewer</strong> — open
                  and edit <code className="text-accent text-xs">.pptx</code> files inline.
                </li>
              </ul>
              <p>
                Everything stays as ordinary files in your vault. Move the folder, back it up, or
                sync it with any service — your data is always yours.
              </p>
            </div>
          </section>

          {/* Privacy */}
          <section className="mb-10 flex items-start gap-3 rounded-lg border border-border bg-bg px-5 py-4">
            <Shield className="text-success mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
            <div className="text-fg-secondary text-sm leading-relaxed">
              <strong className="text-fg font-medium">Privacy by design.</strong> No telemetry,
              no account, no data leaves your device unless you opt into cloud sync. AI chat keys
              are stored locally and never transmitted through Mentis servers.
            </div>
          </section>

          {/* Features accordion */}
          <section className="mb-16">
            <h2 className="text-fg mb-4 text-lg font-semibold">Features</h2>
            <div className="border-border overflow-hidden rounded-lg border bg-bg">
              {FEATURES.map((f) => (
                <AccordionItem
                  key={f.title}
                  icon={f.icon}
                  iconColor={f.iconColor}
                  title={f.title}
                >
                  {f.content}
                </AccordionItem>
              ))}
            </div>
          </section>

          {/* Footer */}
          <p className="text-fg-muted mb-8 text-center text-xs">
            Licensed under BSL 1.1 — see{' '}
            <a
              href="https://github.com/nicholasgriffintn/ink-marrow/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              LICENSE
            </a>{' '}
            for details.
          </p>
        </div>
      </div>
    </div>
  )
}
