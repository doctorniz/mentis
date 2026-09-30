import { PptxViewer } from '@/components/pptx/pptx-viewer'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function PptxFileViewer(props: FileEditorProps) {
  return <PptxViewer path={props.path} openFile={props.openFile} refreshTree={props.refreshTree} />
}
