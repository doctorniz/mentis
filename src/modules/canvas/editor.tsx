import { CanvasEditor } from '@/components/canvas/canvas-editor'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function CanvasFileEditor(props: FileEditorProps) {
  return (
    <div className="min-h-0 flex-1">
      <CanvasEditor
        tabId={props.tabId}
        path={props.path}
        isNew={props.isNew}
        onRenamed={props.refreshTree}
        onPersisted={props.notifySaved}
        onRename={props.renameFile}
      />
    </div>
  )
}
