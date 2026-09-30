import { DocxViewer } from '@/components/notes/docx-viewer'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function DocxFileViewer(props: FileEditorProps) {
  return (
    <DocxViewer
      tabId={props.tabId}
      path={props.path}
      onRenamed={props.refreshTree}
      openFile={props.openFile}
    />
  )
}
