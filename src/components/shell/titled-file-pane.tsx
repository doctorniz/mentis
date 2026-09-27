import type { ReactNode } from 'react'
import { InlineFileTitle } from '@/components/shell/inline-file-title'
import { cn } from '@/utils/cn'

function extFromPath(path: string): string {
  const name = path.split('/').pop() ?? path
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i) : ''
}

/**
 * A file preview with an inline-renamable title bar above it. Used by the media
 * viewers (image, video, audio); moved out of notes-view.tsx so each module can
 * use it without importing another module.
 */
export function TitledFilePane({
  tabId,
  path,
  onRename,
  bodyClassName,
  children,
}: {
  tabId: string
  path: string
  onRename: (tabId: string, oldPath: string, stem: string, ext: string) => void
  bodyClassName?: string
  children: ReactNode
}) {
  const ext = extFromPath(path)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <InlineFileTitle
          path={path}
          onRename={(oldPath, newStem) => void onRename(tabId, oldPath, newStem, ext)}
        />
      </div>
      <div className={cn('bg-bg flex min-h-0 flex-1 flex-col overflow-hidden', bodyClassName)}>
        {children}
      </div>
    </div>
  )
}
