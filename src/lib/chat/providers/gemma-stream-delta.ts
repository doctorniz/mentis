/**
 * MediaPipe `LlmInference.generateResponse` may invoke the progress listener with
 * either incremental chunks (official samples use `output += partial`) or
 * cumulative text-so-far. Detecting which style each callback uses avoids
 * mis-sliced deltas (glued words, duplicated spans, dropped spaces).
 */
export function nextGemmaStreamDelta(
  emittedTotal: string,
  partial: string,
): { delta: string; emittedTotal: string } {
  const p = partial ?? ''
  if (p.length === 0) return { delta: '', emittedTotal }

  if (p.startsWith(emittedTotal)) {
    return { delta: p.slice(emittedTotal.length), emittedTotal: p }
  }
  return { delta: p, emittedTotal: emittedTotal + p }
}
