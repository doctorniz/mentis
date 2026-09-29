/// <reference lib="webworker" />
// First, like every entry: gray-matter needs `Buffer` before its module body runs.
import '@/node-globals'
import { runExtractor } from './extract'
import type { ExtractMessage, ExtractResponse } from './extract-protocol'

/** Parses files for the search index off the main thread. Holds no state. */

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (event: MessageEvent<ExtractMessage>) => {
  const { id, request } = event.data
  let response: ExtractResponse
  try {
    response = { id, ok: true, result: await runExtractor(request) }
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(response)
}
