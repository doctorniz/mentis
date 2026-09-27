type PdfjsLib = typeof import('pdfjs-dist')

let pdfjs: PdfjsLib | null = null
let loading: Promise<PdfjsLib> | null = null

/**
 * The worker is served from public/ (copied there by scripts/copy-pdf-worker.mjs
 * at postinstall) rather than resolved through the bundler. `new URL(bare, import.meta.url)`
 * is a webpack-only affordance; a plain absolute path works under any bundler
 * and keeps the worker version locked to the installed pdfjs-dist.
 */
const PDF_WORKER_SRC = '/pdf.worker.min.mjs'

export async function loadPdfjs(): Promise<PdfjsLib> {
  if (pdfjs) return pdfjs
  if (loading) return loading
  loading = import('pdfjs-dist').then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC
    pdfjs = mod
    return mod
  })
  return loading
}
