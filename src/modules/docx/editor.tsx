import { DocxEditorView } from '@/components/notes/docx-editor'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function DocxFileEditor(props: FileEditorProps) {
  // Saves refresh the tree rather than the backlink scan, as before.
  return (
    <DocxEditorView
      tabId={props.tabId}
      path={props.path}
      onRenamed={props.refreshTree}
      onPersisted={props.refreshTree}
    />
  )
}
