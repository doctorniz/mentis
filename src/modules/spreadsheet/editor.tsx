import { SpreadsheetViewer } from '@/components/notes/spreadsheet-viewer'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function SpreadsheetFileEditor(props: FileEditorProps) {
  return <SpreadsheetViewer tabId={props.tabId} path={props.path} onRenamed={props.refreshTree} />
}
