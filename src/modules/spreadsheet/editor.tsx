import { SpreadsheetEditor } from '@/components/notes/spreadsheet-editor'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function SpreadsheetFileEditor(props: FileEditorProps) {
  return (
    <SpreadsheetEditor
      tabId={props.tabId}
      path={props.path}
      onRenamed={props.refreshTree}
      onPersisted={props.notifySaved}
    />
  )
}
