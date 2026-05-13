/** Turn thrown values into a short human string for logs and UI. */
export function formatUnknownError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'number') {
    return `Model runtime failed (${err}). Try reloading or another browser with WebGPU.`
  }
  if (err == null) return 'Unknown error'
  return String(err)
}
