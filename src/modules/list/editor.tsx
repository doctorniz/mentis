import { ListEditor } from '@/components/lists/list-editor'
import type { FileEditorProps } from '@/core/registries/file-types'

/** A `.list.md` opened from the notes tree. */
export default function ListFileEditor(props: FileEditorProps) {
  return (
    <div className="min-h-0 flex-1">
      <ListEditor path={props.path} tabId={props.tabId} onPersisted={props.notifySaved} />
    </div>
  )
}
