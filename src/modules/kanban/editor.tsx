import { KanbanEditor } from '@/components/kanban/kanban-editor'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function KanbanFileEditor(props: FileEditorProps) {
  return (
    <div className="min-h-0 flex-1">
      <KanbanEditor
        tabId={props.tabId}
        path={props.path}
        isNew={props.isNew}
        onRenamed={props.refreshTree}
        onPersisted={props.notifySaved}
      />
    </div>
  )
}
