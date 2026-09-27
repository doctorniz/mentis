import { PdfViewer } from '@/components/pdf/pdf-viewer'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function PdfFileEditor(props: FileEditorProps) {
  return <PdfViewer path={props.path} />
}
