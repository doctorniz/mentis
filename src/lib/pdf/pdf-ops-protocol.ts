import type * as pages from './page-operations'
import type * as writer from './annotation-writer'

/** The pdf-lib operations that run in the PDF worker: bytes in, bytes (or data) out. */
export interface PdfOps {
  writeAnnotationsIntoPdf: typeof writer.writeAnnotationsIntoPdf
  insertBlankPage: typeof pages.insertBlankPage
  appendBlankPage: typeof pages.appendBlankPage
  deletePage: typeof pages.deletePage
  rotatePage: typeof pages.rotatePage
  reorderPages: typeof pages.reorderPages
  mergePages: typeof pages.mergePages
  extractPages: typeof pages.extractPages
  getFormFields: typeof pages.getFormFields
  fillFormFields: typeof pages.fillFormFields
}

export type PdfOpName = keyof PdfOps

export interface PdfOpMessage<K extends PdfOpName = PdfOpName> {
  id: number
  op: K
  args: Parameters<PdfOps[K]>
}

export type PdfOpResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
