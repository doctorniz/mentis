type PdfjsLib = typeof import('pdfjs-dist')

let pdfjs: PdfjsLib | null = null
let loading: Promise<PdfjsLib> | null = null

export async function loadPdfjs(): Promise<PdfjsLib> {
  if (pdfjs) return pdfjs
  if (loading) return loading
  loading = import('pdfjs-dist').then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
    pdfjs = mod
    return mod
  })
  return loading
}
