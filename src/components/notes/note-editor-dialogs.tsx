import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Loader2 } from 'lucide-react'
import type { FileSystemAdapter } from '@/lib/fs'
import { InsertMediaDialog } from '@/components/notes/insert-media-dialog'
import { InsertLinkDialog } from '@/components/notes/insert-link-dialog'
import { setSlashDialogHandlers } from '@/lib/editor/slash-dialog-bridge'
import { listTemplates, readTemplate, type NoteTemplate } from '@/lib/notes/template-store'
import { markdownToTiptapJSON } from '@/lib/editor/markdown-bridge'
import { parseNote } from '@/lib/markdown'
import { fillTemplate } from '@/lib/notes/template-vars'
import { useEditorStore } from '@/stores/editor'
import { useVaultStore } from '@/stores/vault'
import { ASSETS_DIR, DEFAULT_VAULT_CONFIG } from '@/types/vault'
import { toast } from '@/stores/toast'

/* ------------------------------------------------------------------ */
/* Template picker                                                      */
/* ------------------------------------------------------------------ */

function TemplatePicker({
  templates,
  loading,
  onPick,
}: {
  templates: NoteTemplate[]
  loading: boolean
  onPick: (filename: string) => void
}) {
  return (
    <div className="border-border bg-bg fixed top-24 left-1/2 z-50 flex max-h-64 w-56 -translate-x-1/2 flex-col overflow-y-auto rounded-lg border p-1 shadow-lg">
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="text-fg-muted size-4 animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <p className="text-fg-muted px-3 py-2 text-xs">No templates yet</p>
      ) : (
        templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.filename)}
            className="hover:bg-bg-hover text-fg truncate rounded-md px-3 py-1.5 text-left text-sm"
          >
            {t.name}
          </button>
        ))
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                              */
/* ------------------------------------------------------------------ */

export type InsertImageFn = (vaultPath: string, fileName: string) => Promise<void>
export type InsertVideoFn = (vaultPath: string) => void

/**
 * The note editor's dialogs: image, video, template and link to a note.
 * There is no toolbar; the `/` menu and the selection menu open them
 * through the slash-dialog bridge.
 */
export function NoteEditorDialogs({
  editor,
  vaultFs,
  allPaths = [],
  attachmentFolder = ASSETS_DIR,
  onInsertImage,
  onInsertVideo,
}: {
  editor: Editor | null
  vaultFs?: FileSystemAdapter
  allPaths?: string[]
  attachmentFolder?: string
  onInsertImage?: InsertImageFn
  onInsertVideo?: InsertVideoFn
}) {
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [videoDialogOpen, setVideoDialogOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [templatePicker, setTemplatePicker] = useState(false)
  const [templates, setTemplates] = useState<NoteTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const templateFolder = useVaultStore(
    (s) => s.config?.templateFolder ?? DEFAULT_VAULT_CONFIG.templateFolder,
  )

  // Bridge for the slash menu — it's a pure `{editor, range}` command list
  // with no route to this component's dialog state, so it calls these
  // open-handlers instead. See slash-dialog-bridge.ts for why this is safe.
  useEffect(() => {
    setSlashDialogHandlers({
      openImageDialog: () => setImageDialogOpen(true),
      openVideoDialog: () => setVideoDialogOpen(true),
      openTemplateDialog: () => setTemplatePicker(true),
      openLinkDialog: () => setLinkDialogOpen(true),
    })
    return () => setSlashDialogHandlers(null)
  }, [])

  useEffect(() => {
    if (!templatePicker || !vaultFs) return
    let cancelled = false
    setTemplatesLoading(true)
    void listTemplates(vaultFs, templateFolder).then((list) => {
      if (!cancelled) {
        setTemplates(list)
        setTemplatesLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [templatePicker, vaultFs, templateFolder])

  if (!editor) return null

  async function insertTemplate(filename: string) {
    setTemplatePicker(false)
    if (!vaultFs || !editor) return
    try {
      const raw = await readTemplate(vaultFs, filename, templateFolder)
      const { content: body } = parseNote(filename, raw)
      const { tabs, activeTabId } = useEditorStore.getState()
      const title = tabs.find((t) => t.id === activeTabId)?.title ?? ''
      const json = markdownToTiptapJSON(fillTemplate(body, { date: new Date(), title }))
      editor
        .chain()
        .focus()
        .insertContent(json.content ?? [])
        .run()
    } catch (e) {
      console.error('Failed to insert template', e)
      toast.error('Failed to insert template')
    }
  }

  function insertWikiLink(path: string) {
    // strip leading slash if present
    const target = path.replace(/^\/+/, '')
    const basename = target.split('/').pop() ?? target
    // Selected text becomes the link's label; otherwise the file's name.
    const { from, to } = editor!.state.selection
    const selected = editor!.state.doc.textBetween(from, to).trim()
    const label = selected || basename.replace(/\.[^/.]+$/, '')
    editor!
      .chain()
      .focus()
      .insertContent({
        type: 'wikiLink',
        attrs: { target, label },
      })
      .run()
  }

  return (
    <>
      {vaultFs && onInsertImage && (
        <InsertMediaDialog
          open={imageDialogOpen}
          mode="image"
          attachmentFolder={attachmentFolder}
          onInsert={(path, name) => void onInsertImage(path, name)}
          onClose={() => setImageDialogOpen(false)}
        />
      )}

      {vaultFs && onInsertVideo && (
        <InsertMediaDialog
          open={videoDialogOpen}
          mode="video"
          attachmentFolder={attachmentFolder}
          onInsert={(path) => onInsertVideo(path)}
          onClose={() => setVideoDialogOpen(false)}
        />
      )}

      {templatePicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setTemplatePicker(false)} />
          <TemplatePicker
            templates={templates}
            loading={templatesLoading}
            onPick={(filename) => void insertTemplate(filename)}
          />
        </>
      )}

      <InsertLinkDialog
        open={linkDialogOpen}
        title="Link to a note"
        allPaths={allPaths}
        onInsert={insertWikiLink}
        onClose={() => setLinkDialogOpen(false)}
      />
    </>
  )
}
