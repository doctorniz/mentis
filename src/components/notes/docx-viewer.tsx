'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useEditorStore } from '@/stores/editor'
import { InlineFileTitle } from '@/components/shell/inline-file-title'
import { ConvertButton } from '@/components/notes/convert-button'
import { Button } from '@/components/ui/button'
import { toast } from '@/stores/toast'
import { vaultPathsPointToSameFile } from '@/lib/fs/vault-path-equiv'

const PAGE_CSS = `
  body { font: 16px/1.6 Georgia, 'Times New Roman', serif; color: #1c1c1c; background: #fff;
         max-width: 46rem; margin: 0 auto; padding: 2rem 1.5rem 4rem; overflow-wrap: anywhere; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; margin: 1rem 0; }
  td, th { border: 1px solid #c8c8c8; padding: 0.3rem 0.6rem; vertical-align: top; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; }
  a { color: #2563eb; }
`

/**
 * Read-only Word viewer. The file is turned into HTML by mammoth and shown in
 * a script-less sandboxed frame, so nothing inside the document can run and
 * its styles cannot leak into the app. Nothing is written back.
 */
export function DocxViewer({
  tabId,
  path,
  onRenamed,
  openFile,
}: {
  tabId: string
  path: string
  onRenamed: () => void
  openFile: (path: string) => void
}) {
  const { vaultFs } = useVaultSession()
  const retargetTabPath = useEditorStore((s) => s.retargetTabPath)
  const pathRef = useRef(path)
  pathRef.current = path

  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)
    void (async () => {
      try {
        const [bytes, mammoth] = await Promise.all([vaultFs.readFile(path), import('mammoth')])
        const buffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
        if (!cancelled) setHtml(result.value)
      } catch (e) {
        console.error('DOCX load failed', e)
        if (!cancelled) setError('Failed to load this Word document.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path, vaultFs])

  const handleDownload = useCallback(async () => {
    try {
      const bytes = await vaultFs.readFile(path)
      const blob = new Blob(
        [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
        { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = path.split('/').pop() ?? 'document.docx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download file')
    }
  }, [vaultFs, path])

  function handleRename(oldPath: string, newStem: string) {
    const fullName = newStem.toLowerCase().endsWith('.docx') ? newStem : `${newStem}.docx`
    const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : ''
    const newPath = parent ? `${parent}/${fullName}` : fullName
    if (vaultPathsPointToSameFile(newPath, oldPath)) return

    void (async () => {
      try {
        if (await vaultFs.exists(newPath)) {
          toast.error('A file with that name already exists')
          return
        }
        await vaultFs.rename(oldPath, newPath)
        retargetTabPath(tabId, newPath, fullName.replace(/\.docx$/i, ''))
        pathRef.current = newPath
        onRenamed()
        window.dispatchEvent(new CustomEvent('ink:vault-changed'))
      } catch {
        toast.error('Failed to rename')
      }
    })()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <InlineFileTitle path={path} onRename={handleRename} />
        <span className="text-fg-muted font-mono text-xs">.docx</span>
        <div className="ml-auto flex items-center gap-1">
          <ConvertButton path={path} openFile={openFile} refreshTree={onRenamed} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            onClick={() => void handleDownload()}
            aria-label="Download document"
            title="Download"
          >
            <Download className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-neutral-100 dark:bg-neutral-900">
        {html === null && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-fg-muted text-sm">Loading document…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-danger text-sm">{error}</span>
          </div>
        )}
        {html !== null && (
          <iframe
            title="Document preview"
            sandbox=""
            className="size-full border-0"
            srcDoc={`<!doctype html><meta charset="utf-8"><style>${PAGE_CSS}</style><body>${html}</body>`}
          />
        )}
      </div>
    </div>
  )
}
