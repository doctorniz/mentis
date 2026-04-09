'use client'

import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'

export function SignaturePadDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSave: (imageDataUrl: string, name: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'draw' | 'upload'>('draw')
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)

  function getCtx() {
    return canvasRef.current?.getContext('2d') ?? null
  }

  function clearCanvas() {
    const ctx = getCtx()
    const c = canvasRef.current
    if (ctx && c) ctx.clearRect(0, 0, c.width, c.height)
  }

  function startDraw(e: React.PointerEvent) {
    const ctx = getCtx()
    if (!ctx) return
    setDrawing(true)
    const r = canvasRef.current!.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top)
  }

  function moveDraw(e: React.PointerEvent) {
    if (!drawing) return
    const ctx = getCtx()
    if (!ctx) return
    const r = canvasRef.current!.getBoundingClientRect()
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#000'
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top)
    ctx.stroke()
  }

  function endDraw() {
    setDrawing(false)
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setUploadedUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  function handleSave() {
    const label = name.trim() || 'Signature'
    if (mode === 'draw') {
      const url = canvasRef.current?.toDataURL('image/png')
      if (url) onSave(url, label)
    } else if (uploadedUrl) {
      onSave(uploadedUrl, label)
    }
    onOpenChange(false)
    setName('')
    setUploadedUrl(null)
    clearCanvas()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[199] bg-black/40" />
        <Dialog.Content className="border-border-strong bg-bg fixed top-1/2 left-1/2 z-[200] w-[min(100%,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-lg">
          <Dialog.Title className="text-fg text-sm font-semibold">
            {mode === 'draw' ? 'Draw signature' : 'Upload signature'}
          </Dialog.Title>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('draw')}
              className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'draw' ? 'bg-accent text-accent-fg' : 'bg-bg-tertiary text-fg-secondary'}`}
            >
              Draw
            </button>
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'upload' ? 'bg-accent text-accent-fg' : 'bg-bg-tertiary text-fg-secondary'}`}
            >
              Upload
            </button>
          </div>

          {mode === 'draw' ? (
            <div className="mt-3">
              <canvas
                ref={canvasRef}
                width={380}
                height={140}
                aria-label="Signature drawing area"
                role="application"
                className="border-border-strong w-full cursor-crosshair rounded-lg border bg-white"
                onPointerDown={startDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
              />
              <button
                type="button"
                onClick={clearCanvas}
                className="text-fg-muted mt-1 text-xs underline"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <input type="file" accept="image/*" aria-label="Upload signature image" onChange={handleUpload} className="text-sm" />
              {uploadedUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={uploadedUrl} alt="Uploaded signature" className="mt-2 max-h-32 rounded border" />
              )}
            </div>
          )}

          <label className="text-fg-secondary mt-3 flex flex-col gap-1 text-xs">
            Label
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My signature"
              className="border-border bg-bg-secondary text-fg rounded-md border px-2 py-1.5 text-sm"
            />
          </label>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save signature</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
