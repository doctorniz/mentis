'use client'

import { useState } from 'react'
import { FileOutput } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { Button } from '@/components/ui/button'
import { convertLabel, convertVaultFile } from '@/core/convert/convert-file'
import { toast } from '@/stores/toast'

/** Converts an Office file to a sibling Markdown file and opens the result. */
export function ConvertButton({
  path,
  openFile,
  refreshTree,
}: {
  path: string
  openFile: (path: string) => void
  refreshTree: () => void
}) {
  const { vaultFs } = useVaultSession()
  const [busy, setBusy] = useState(false)
  const label = convertLabel(path)
  if (!label) return null

  async function run() {
    setBusy(true)
    try {
      const result = await convertVaultFile(vaultFs, path)
      refreshTree()
      if (result.warning) toast.warning(result.warning)
      else toast.success(`Created ${result.path.split('/').pop()}`)
      openFile(result.path)
    } catch (e) {
      console.error('Conversion failed', e)
      toast.error('Could not convert this file')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      disabled={busy}
      onClick={() => void run()}
    >
      <FileOutput className="size-3.5" />
      {busy ? 'Converting…' : label}
    </Button>
  )
}
