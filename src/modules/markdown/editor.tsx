import type { Ref } from 'react'
import type { Editor } from '@tiptap/core'
import {
  MarkdownNoteEditor,
  type MarkdownNoteEditorHandle,
} from '@/components/notes/markdown-note-editor'
import type { FileEditorProps } from '@/core/registries/file-types'

export default function MarkdownFileEditor(props: FileEditorProps) {
  return (
    <MarkdownNoteEditor
      ref={props.handleRef as Ref<MarkdownNoteEditorHandle> | undefined}
      tabId={props.tabId}
      path={props.path}
      markdownPaths={props.linkTargets}
      onOpenNotePath={props.openFile}
      onPersisted={props.notifySaved}
      onRenamed={props.refreshTree}
      onChatAssetIdFromDisk={props.onChatAssetIdFromDisk}
      onEditorReady={props.onEditorReady as ((editor: Editor | null) => void) | undefined}
    />
  )
}
