'use client'

import type { PDFPageProxy } from 'pdfjs-dist'
import { BookOpen, ChevronLeft, Layers } from 'lucide-react'
import { PdfPagePanel } from '@/components/pdf/pdf-page-panel'
import { PdfOutlineContent } from '@/components/pdf/pdf-outline-sidebar'
import { cn } from '@/utils/cn'

export type SideColumnTab = 'pages' | 'outline'

interface PdfSideColumnProps {
  expanded: boolean
  onToggleExpand: () => void
  activeTab: SideColumnTab
  onTabChange: (tab: SideColumnTab) => void

  pdfDoc: import('pdfjs-dist').PDFDocumentProxy | null
  onNavigate: (pageIndex: number) => void

  pages: PDFPageProxy[]
  onReorder: (newOrder: number[]) => void
  onInsertBlank: (beforeIndex: number) => void
  onDelete: (index: number) => void
  onRotate: (index: number) => void
  onMerge: (files: FileList) => void
  onExtractPages: (indices: number[]) => void
}

const TABS: { id: SideColumnTab; label: string; icon: typeof Layers }[] = [
  { id: 'pages', label: 'Pages', icon: Layers },
  { id: 'outline', label: 'Outline', icon: BookOpen },
]

export function PdfSideColumn({
  expanded,
  onToggleExpand,
  activeTab,
  onTabChange,
  pdfDoc,
  onNavigate,
  pages,
  onReorder,
  onInsertBlank,
  onDelete,
  onRotate,
  onMerge,
  onExtractPages,
}: PdfSideColumnProps) {
  if (!expanded) {
    return (
      <div className="border-border bg-bg-secondary flex w-9 shrink-0 flex-col items-center border-r py-2">
        <button
          type="button"
          title="Show side panel"
          aria-label="Show side panel"
          aria-expanded={false}
          onClick={onToggleExpand}
          className="text-fg-secondary hover:bg-bg-hover hover:text-fg rounded-md p-1.5 transition-colors"
        >
          <Layers className="size-4" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="border-border bg-bg-secondary flex w-[220px] shrink-0 flex-col border-r">
      <div className="border-border flex items-center border-b">
        <div className="flex min-w-0 flex-1" role="tablist" aria-label="Side panel tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => onTabChange(id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-1.5 text-[11px] font-medium transition-colors',
                activeTab === id
                  ? 'border-accent text-accent'
                  : 'text-fg-tertiary hover:text-fg-secondary border-transparent',
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          title="Hide side panel"
          aria-label="Hide side panel"
          aria-expanded
          onClick={onToggleExpand}
          className="text-fg-muted hover:text-fg hover:bg-bg-hover mr-1 shrink-0 rounded p-1 transition-colors"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
        </button>
      </div>

      {activeTab === 'pages' ? (
        <PdfPagePanel
          pages={pages}
          onReorder={onReorder}
          onInsertBlank={onInsertBlank}
          onDelete={onDelete}
          onRotate={onRotate}
          onMerge={onMerge}
          onExtractPages={onExtractPages}
        />
      ) : (
        <PdfOutlineContent pdfDoc={pdfDoc} onNavigate={onNavigate} />
      )}
    </div>
  )
}
