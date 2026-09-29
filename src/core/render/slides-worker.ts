/// <reference lib="webworker" />
import '@/node-globals'
import { renderSlides } from './slides-render'
import type { SlidesRequest, SlidesResponse } from './slides-protocol'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<SlidesRequest>) => {
  const { id, source } = event.data
  let response: SlidesResponse
  try {
    response = { id, ok: true, result: renderSlides(source) }
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(response)
}
