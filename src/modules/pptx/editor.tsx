import { PptxEditorView } from '@/components/pptx/pptx-editor'
import { PptxCompactViewer } from '@/components/pptx/pptx-compact-viewer'
import { PPTX_COMPACT_MEDIA_QUERY } from '@/lib/browser/breakpoints'
import { useMediaQuery } from '@/lib/browser/use-media-query'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function PptxFileEditor(props: FileEditorProps) {
  const isCompact = useMediaQuery(PPTX_COMPACT_MEDIA_QUERY)
  return isCompact ? (
    <PptxCompactViewer path={props.path} />
  ) : (
    <PptxEditorView
      tabId={props.tabId}
      path={props.path}
      onRenamed={props.refreshTree}
      onPersisted={props.notifySaved}
    />
  )
}
