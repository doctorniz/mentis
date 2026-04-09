'use client'

import { useCallback, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import type { FileSystemAdapter } from '@/lib/fs'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

export function FbImportZone({
  vaultFs,
  targetFolder,
  onImported,
}: {
  vaultFs: FileSystemAdapter
  targetFolder: string
  onImported: () => void
}) {
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!files.length) return
      setBusy(true)
      try {
        for (const file of Array.from(files)) {
          const buf = new Uint8Array(await file.arrayBuffer())
          const dest = targetFolder ? `${targetFolder}/${file.name}` : file.name
          await vaultFs.writeFile(dest, buf)
        }
        onImported()
      } finally {
        setBusy(false)
      }
    },
    [vaultFs, targetFolder, onImported],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setOver(false)
      void importFiles(e.dataTransfer.files)
    },
    [importFiles],
  )

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={cn(
        'border-border-strong flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
        over ? 'border-accent bg-accent-light/30' : 'bg-bg',
      )}
    >
      <Download className="text-fg-muted size-8" aria-hidden />
      <p className="text-fg-secondary text-sm">
        {busy ? 'Importing…' : 'Drag files here to import into your vault'}
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        aria-label="Choose files to import"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void importFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        Choose files
      </Button>
    </div>
  )
}
