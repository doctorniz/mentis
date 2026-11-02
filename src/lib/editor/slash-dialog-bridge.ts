/**
 * The slash-command list is a pure `{ editor, range } => void` command
 * signature with no route to the dialogs `NoteEditorDialogs` owns as local
 * state (image/video upload, link-to-file search, template picker). Rather
 * than threading dialog setters through the Suggestion/ReactRenderer
 * plumbing, `NoteEditorDialogs` registers its open-handlers here on mount
 * (mirroring the existing `setImageVaultFs`-style module-scope binding used
 * by the vault-image/video/pdf extensions) and slash items call them
 * directly. Only one markdown tab is ever mounted at a time (`notes-view`
 * keys `MarkdownNoteEditor` by `activeTab.id`), so a single module-level
 * slot is safe — no risk of one tab's slash menu opening another's dialog.
 */
export type SlashDialogHandlers = {
  openImageDialog: () => void
  openVideoDialog: () => void
  openTemplateDialog: () => void
  /** Link to a note; selected text becomes the link's label. */
  openLinkDialog: () => void
}

let handlers: SlashDialogHandlers | null = null

export function setSlashDialogHandlers(h: SlashDialogHandlers | null): void {
  handlers = h
}

export function getSlashDialogHandlers(): SlashDialogHandlers | null {
  return handlers
}
