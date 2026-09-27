import { useVaultSession } from '@/contexts/vault-fs-context'
import { VideoPlayerView } from '@/components/notes/video-player-view'
import { TitledFilePane } from '@/components/shell/titled-file-pane'
import { titleFromVaultPath } from '@/lib/notes/editor-tab-from-path'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function VideoFileEditor(props: FileEditorProps) {
  const { vaultFs } = useVaultSession()
  return (
    <TitledFilePane tabId={props.tabId} path={props.path} onRename={props.renameFile}>
      <VideoPlayerView vaultFs={vaultFs} path={props.path} title={titleFromVaultPath(props.path)} />
    </TitledFilePane>
  )
}
