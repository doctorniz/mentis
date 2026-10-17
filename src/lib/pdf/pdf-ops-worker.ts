/// <reference lib="webworker" />

/**
 * Runs pdf-lib off the main thread: loading and saving a large PDF takes long
 * enough to freeze the page (CLAUDE.md, principle 5). Started on demand by
 * `pdf-ops.ts`.
 */

import { writeAnnotationsIntoPdf } from './annotation-writer'
import {
  insertBlankPage,
  appendBlankPage,
  deletePage,
  rotatePage,
  reorderPages,
  mergePages,
  extractPages,
  getFormFields,
  fillFormFields,
} from './page-operations'
import type { PdfOpMessage, PdfOpResponse, PdfOps } from './pdf-ops-protocol'

const OPS: PdfOps = {
  writeAnnotationsIntoPdf,
  insertBlankPage,
  appendBlankPage,
  deletePage,
  rotatePage,
  reorderPages,
  mergePages,
  extractPages,
  getFormFields,
  fillFormFields,
}

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = async (event: MessageEvent<PdfOpMessage>) => {
  const { id, op, args } = event.data
  try {
    const run = OPS[op] as (...a: unknown[]) => Promise<unknown>
    const result = await run(...(args as unknown[]))
    const response: PdfOpResponse = { id, ok: true, result }
    scope.postMessage(response, result instanceof Uint8Array ? [result.buffer] : [])
  } catch (err) {
    const response: PdfOpResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
    scope.postMessage(response)
  }
}
