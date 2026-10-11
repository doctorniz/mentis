import { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { getNoteEditorExtensions } from '@/lib/editor/tiptap-extensions'
import { markdownToTiptapJSON, tiptapJSONToMarkdown } from '@/lib/editor/markdown-bridge'
import { setImageVaultFs } from '@/lib/editor/vault-image-extension'
import { setVideoVaultFs } from '@/lib/editor/vault-video-extension'
import { setPdfEmbedVaultFs } from '@/lib/editor/pdf-embed-extension'
import { cn } from '@/utils/cn'

/**
 * The note editor on one journal tab's markdown. Mount it with a `key` per
 * day and tab: it takes `markdown` once, then reports every change.
 */
export function SectionEditor({
  markdown,
  onChange,
  editable,
  placeholder,
  journalPath,
}: {
  markdown: string
  onChange: (markdown: string) => void
  editable: boolean
  placeholder: string
  /** The day's file, for resolving relative links and embeds. */
  journalPath: string
}) {
  const { vaultFs } = useVaultSession()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const pathRef = useRef(journalPath)
  pathRef.current = journalPath

  useEffect(() => {
    setImageVaultFs(vaultFs)
    setVideoVaultFs(vaultFs)
    setPdfEmbedVaultFs(vaultFs)
  }, [vaultFs])

  const extensions = useMemo(
    () =>
      getNoteEditorExtensions(
        placeholder,
        { getMarkdownPaths: () => [], currentNotePath: () => pathRef.current },
        { liveEditor: true },
      ),
    [placeholder],
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    editable,
    content: markdownToTiptapJSON(markdown),
    editorProps: {
      attributes: {
        class: cn('tiptap-editor focus:outline-none', 'min-h-[50vh] px-8 pb-10 pt-2'),
        'aria-label': 'Journal entry',
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: ed }) => onChangeRef.current(tiptapJSONToMarkdown(ed.getJSON())),
  })

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  return <EditorContent editor={editor} />
}
