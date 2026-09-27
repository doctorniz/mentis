import { CodeFileEditor } from '@/components/notes/code-file-editor'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function CodeFileTypeEditor(props: FileEditorProps) {
  return <CodeFileEditor tabId={props.tabId} path={props.path} onRenamed={props.refreshTree} />
}
