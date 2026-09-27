import { useVaultSession } from '@/contexts/vault-fs-context'
import { ImageEditorView } from '@/components/notes/image-editor-view'
import { TitledFilePane } from '@/components/shell/titled-file-pane'
import { titleFromVaultPath } from '@/lib/notes/editor-tab-from-path'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function ImageFileEditor(props: FileEditorProps) {
  const { vaultFs } = useVaultSession()
  return (
    <TitledFilePane
      tabId={props.tabId}
      path={props.path}
      onRename={props.renameFile}
      bodyClassName="p-3"
    >
      <ImageEditorView vaultFs={vaultFs} path={props.path} title={titleFromVaultPath(props.path)} />
    </TitledFilePane>
  )
}
