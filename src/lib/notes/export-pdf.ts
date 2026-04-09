import { generateHTML } from '@tiptap/html'
import type { JSONContent } from '@tiptap/core'
import { getNoteEditorExtensions } from '@/lib/editor/tiptap-extensions'
import type { FileSystemAdapter } from '@/lib/fs'
import { isImagePath } from '@/lib/notes/assets'

const extensions = getNoteEditorExtensions()

/**
 * Build a standalone, print-ready HTML string from Tiptap JSON content.
 * Vault-relative images are inlined as base64 data URIs.
 */
export async function buildExportHtml(
  doc: JSONContent,
  title: string,
  vaultFs?: FileSystemAdapter,
): Promise<string> {
  let html = generateHTML(doc, extensions)

  if (vaultFs) {
    html = await inlineVaultImages(html, vaultFs)
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escHtml(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<article>${html}</article>
</body>
</html>`
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
}

async function inlineVaultImages(
  html: string,
  fs: FileSystemAdapter,
): Promise<string> {
  const imgRe = /<img([^>]*)\ssrc="([^"]+)"([^>]*)>/g
  const matches = [...html.matchAll(imgRe)]
  let result = html

  for (const m of matches) {
    const src = m[2]!
    if (src.startsWith('http') || src.startsWith('data:') || !isImagePath(src)) continue
    try {
      const data = await fs.readFile(src)
      const ext = src.split('.').pop()?.toLowerCase() ?? 'png'
      const mime = MIME[ext] ?? 'image/png'
      const b64 = uint8ToBase64(data)
      const dataUri = `data:${mime};base64,${b64}`
      result = result.replace(m[0]!, m[0]!.replace(src, dataUri))
    } catch {
      // Leave original src if file not found
    }
  }
  return result
}

function uint8ToBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]!)
  return btoa(binary)
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Open a print-ready preview window and trigger the browser's print dialog.
 */
export function printExportHtml(html: string): void {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.addEventListener('afterprint', () => win.close())
  setTimeout(() => win.print(), 300)
}

const PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #1a1a1a;
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem;
  }

  article { }

  h1 { font-size: 1.8em; font-weight: 700; margin: 0.6em 0 0.3em; }
  h2 { font-size: 1.4em; font-weight: 600; margin: 0.5em 0 0.25em; }
  h3 { font-size: 1.2em; font-weight: 600; margin: 0.4em 0 0.2em; }
  p  { margin: 0.4em 0; }

  strong, b { font-weight: 700; }
  em, i { font-style: italic; }
  s, del { text-decoration: line-through; }
  u { text-decoration: underline; }

  a { color: #2563eb; text-decoration: underline; }

  ul, ol { margin: 0.4em 0; padding-left: 1.5em; }
  li { margin: 0.15em 0; }

  ul[data-type="taskList"] {
    list-style: none;
    padding-left: 0;
  }
  ul[data-type="taskList"] li {
    display: flex;
    align-items: baseline;
    gap: 0.4em;
  }
  ul[data-type="taskList"] li::before {
    content: "☐";
    flex-shrink: 0;
  }
  ul[data-type="taskList"] li[data-checked="true"]::before,
  ul[data-type="taskList"] li[data-checked]::before {
    content: "☑";
  }
  ul[data-type="taskList"] li[data-checked="false"]::before {
    content: "☐";
  }

  blockquote {
    border-left: 3px solid #d1d5db;
    margin: 0.5em 0;
    padding-left: 1em;
    color: #4b5563;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
    background: #f3f4f6;
    padding: 0.1em 0.3em;
    border-radius: 3px;
  }
  pre {
    background: #f3f4f6;
    padding: 0.75em 1em;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0.5em 0;
    font-size: 0.9em;
    line-height: 1.5;
  }
  pre code { background: none; padding: 0; }

  hr { border: none; border-top: 1px solid #d1d5db; margin: 1em 0; }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.75em 0;
    font-size: 0.95em;
  }
  th, td {
    border: 1px solid #d1d5db;
    padding: 0.35em 0.6em;
    text-align: left;
  }
  th { background: #f9fafb; font-weight: 600; }

  img {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    margin: 0.4em 0;
  }

  .math-inline, .math-block {
    font-family: 'KaTeX_Main', 'Times New Roman', serif;
  }

  div[data-type="pdf-embed"] {
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 0.5em;
    margin: 0.5em 0;
    color: #6b7280;
    font-size: 0.9em;
    font-style: italic;
  }

  @media print {
    body { padding: 0; max-width: none; }
    a { color: inherit; text-decoration: none; }
    a::after { content: " (" attr(href) ")"; font-size: 0.85em; color: #6b7280; }
    a[href^="#"]::after, a[href^="javascript"]::after { content: ""; }
  }
`
