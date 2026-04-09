'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Contrast,
  Crop,
  RotateCcw,
  RotateCw,
  Save,
  Sun,
  SunMedium,
  Undo2,
} from 'lucide-react'
import type { FileSystemAdapter } from '@/lib/fs'
import {
  defaultImageEditOpts,
  drawEditedImageOntoCanvas,
  getCropSourceRect,
  hasImageEdits,
  isRasterImagePath,
  mimeForImagePath,
  outputDimensionsAfterRotation,
  type ImageEditOpts,
} from '@/lib/browser/image-edit-pipeline'
import { VaultImageView } from '@/components/notes/vault-image-view'
import { evictImageThumbnail } from '@/lib/file-browser/image-thumbnail'
import { cn } from '@/utils/cn'
import { toast } from '@/stores/toast'

const MAX_TRIM = 0.35
const MAX_TRIM_PAIR = 0.92

function clampCropPair(a: number, b: number): [number, number] {
  if (a + b <= MAX_TRIM_PAIR) return [a, b]
  const s = MAX_TRIM_PAIR / (a + b)
  return [a * s, b * s]
}

function ToolIconBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="hover:bg-bg-hover text-fg-secondary disabled:text-fg-muted rounded-md p-1.5 transition-colors disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

function TrimSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const pct = Math.round(value * 100)
  return (
    <label className="text-fg-secondary flex min-w-0 flex-1 flex-col gap-0.5 text-[10px]">
      <span className="text-fg-muted">{label}</span>
      <input
        type="range"
        min={0}
        max={35}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="accent-accent h-1 w-full"
      />
    </label>
  )
}

/**
 * Raster image preview with rotate, crop (edge trim), brightness, contrast, saturation, and save to vault.
 */
export function ImageEditorView({
  path,
  vaultFs,
  title,
}: {
  path: string
  vaultFs: FileSystemAdapter
  title: string
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [opts, setOpts] = useState<ImageEditOpts>(defaultImageEditOpts)
  const [saving, setSaving] = useState(false)
  const [showCrop, setShowCrop] = useState(false)

  const wrapRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef<HTMLCanvasElement>(null)
  const workRef = useRef<HTMLCanvasElement>(null)
  const [viewBox, setViewBox] = useState({ w: 400, h: 400 })

  useEffect(() => {
    if (!isRasterImagePath(path)) return
    setOpts(defaultImageEditOpts())
    setLoadError(false)
    setBlobUrl(null)
    setImgEl(null)
    let revoked = false
    let url: string | null = null
    void vaultFs
      .readFile(path)
      .then((buf) => {
        if (revoked) return
        const blob = new Blob([buf as BlobPart], { type: mimeForImagePath(path) })
        url = URL.createObjectURL(blob)
        setBlobUrl(url)
      })
      .catch(() => setLoadError(true))

    return () => {
      revoked = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [path, vaultFs])

  useEffect(() => {
    if (!blobUrl) return
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => setImgEl(im)
    im.onerror = () => setLoadError(true)
    im.src = blobUrl
    return () => {
      im.onload = null
      im.onerror = null
    }
  }, [blobUrl])

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setViewBox({ w: Math.max(120, r.width - 16), h: Math.max(120, r.height - 16) })
    })
    ro.observe(el)
    const r = el.getBoundingClientRect()
    setViewBox({ w: Math.max(120, r.width - 16), h: Math.max(120, r.height - 16) })
    return () => ro.disconnect()
  }, [])

  const redraw = useCallback(() => {
    const img = imgEl
    const display = displayRef.current
    const work = workRef.current
    if (!img?.naturalWidth || !display || !work) return

    const { sx, sy, sw, sh } = getCropSourceRect(img.naturalWidth, img.naturalHeight, opts.crop)
    if (sw < 2 || sh < 2) return

    const { w: ow, h: oh } = outputDimensionsAfterRotation(sw, sh, opts.rotation)
    const scale = Math.min(viewBox.w / ow, viewBox.h / oh, 1)
    const cw = Math.max(1, Math.floor(ow * scale))
    const ch = Math.max(1, Math.floor(oh * scale))

    work.width = ow
    work.height = oh
    const wctx = work.getContext('2d')
    if (!wctx) return
    drawEditedImageOntoCanvas(wctx, img, opts, ow, oh)

    display.width = cw
    display.height = ch
    const dctx = display.getContext('2d')
    if (!dctx) return
    dctx.imageSmoothingEnabled = true
    dctx.imageSmoothingQuality = 'high'
    dctx.drawImage(work, 0, 0, ow, oh, 0, 0, cw, ch)
  }, [imgEl, opts, viewBox.w, viewBox.h])

  useLayoutEffect(() => {
    redraw()
  }, [redraw])

  const handleSave = useCallback(async () => {
    const img = imgEl
    const work = workRef.current
    if (!img?.naturalWidth || !work) return
    const { sx, sy, sw, sh } = getCropSourceRect(img.naturalWidth, img.naturalHeight, opts.crop)
    if (sw < 2 || sh < 2) {
      toast.error('Crop is too tight')
      return
    }
    const { w: ow, h: oh } = outputDimensionsAfterRotation(sw, sh, opts.rotation)
    setSaving(true)
    try {
      work.width = ow
      work.height = oh
      const wctx = work.getContext('2d')
      if (!wctx) throw new Error('No context')
      drawEditedImageOntoCanvas(wctx, img, opts, ow, oh)

      const mime = mimeForImagePath(path)
      const blob = await new Promise<Blob | null>((resolve) =>
        work.toBlob((b) => resolve(b), mime, mime === 'image/jpeg' ? 0.92 : undefined),
      )
      if (!blob) throw new Error('Export failed')

      const buf = new Uint8Array(await blob.arrayBuffer())
      await vaultFs.writeFile(path, buf)
      evictImageThumbnail(path)
      window.dispatchEvent(new CustomEvent('ink:vault-changed'))
      setOpts(defaultImageEditOpts())
      toast.success('Image saved')
      let newUrl: string | null = null
      const fresh = new Blob([buf], { type: mime })
      newUrl = URL.createObjectURL(fresh)
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return newUrl
      })
      setImgEl(null)
    } catch (e) {
      console.error(e)
      toast.error('Could not save image')
    } finally {
      setSaving(false)
    }
  }, [imgEl, opts, path, vaultFs])

  const reset = useCallback(() => {
    setOpts(defaultImageEditOpts())
  }, [])

  if (!isRasterImagePath(path)) {
    return (
      <VaultImageView
        vaultFs={vaultFs}
        src={path}
        alt={title}
        imgClassName="my-0 max-h-[min(85vh,100%)] max-w-full object-contain shadow-sm"
      />
    )
  }

  if (loadError) {
    return (
      <div className="text-danger text-sm">Could not load image for editing.</div>
    )
  }

  if (!imgEl) {
    return (
      <div className="text-fg-muted flex min-h-[200px] items-center justify-center text-sm">
        Loading image…
      </div>
    )
  }

  const dirty = hasImageEdits(opts)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <canvas ref={workRef} className="pointer-events-none hidden" aria-hidden />

      <div
        className="border-border bg-bg-secondary flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2 py-1.5"
        role="toolbar"
        aria-label="Image edit tools"
      >
        <div className="flex items-center gap-0.5">
          <ToolIconBtn
            title="Rotate 90° clockwise"
            onClick={() => setOpts((o) => ({ ...o, rotation: (o.rotation + 90) % 360 }))}
          >
            <RotateCw className="size-4" />
          </ToolIconBtn>
          <ToolIconBtn
            title="Rotate 90° counter-clockwise"
            onClick={() => setOpts((o) => ({ ...o, rotation: (o.rotation - 90 + 360) % 360 }))}
          >
            <RotateCcw className="size-4" />
          </ToolIconBtn>
          <ToolIconBtn title="Reset adjustments" onClick={reset} disabled={!dirty}>
            <Undo2 className={cn('size-4', !dirty && 'opacity-40')} />
          </ToolIconBtn>
        </div>

        <span className="bg-border hidden h-5 w-px sm:block" aria-hidden />

        <label className="text-fg-secondary flex items-center gap-1.5 text-[11px]">
          <Sun className="text-fg-muted size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">Brightness</span>
          <input
            type="range"
            min={50}
            max={150}
            value={Math.round(opts.brightness * 100)}
            onChange={(e) => setOpts((o) => ({ ...o, brightness: Number(e.target.value) / 100 }))}
            className="accent-accent w-20 sm:w-24"
          />
        </label>
        <label className="text-fg-secondary flex items-center gap-1.5 text-[11px]">
          <Contrast className="text-fg-muted size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">Contrast</span>
          <input
            type="range"
            min={50}
            max={150}
            value={Math.round(opts.contrast * 100)}
            onChange={(e) => setOpts((o) => ({ ...o, contrast: Number(e.target.value) / 100 }))}
            className="accent-accent w-20 sm:w-24"
          />
        </label>
        <label className="text-fg-secondary flex items-center gap-1.5 text-[11px]">
          <SunMedium className="text-fg-muted size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">Saturation</span>
          <input
            type="range"
            min={0}
            max={200}
            value={Math.round(opts.saturate * 100)}
            onChange={(e) => setOpts((o) => ({ ...o, saturate: Number(e.target.value) / 100 }))}
            className="accent-accent w-20 sm:w-24"
          />
        </label>

        <span className="bg-border hidden h-5 w-px md:block" aria-hidden />

        <button
          type="button"
          title={showCrop ? 'Hide crop trim' : 'Trim edges (crop)'}
          aria-expanded={showCrop}
          onClick={() => setShowCrop((s) => !s)}
          className={cn(
            'hover:bg-bg-hover rounded-md p-1.5 transition-colors',
            showCrop ? 'bg-bg-active text-accent' : 'text-fg-secondary',
          )}
        >
          <Crop className="size-4" aria-hidden />
        </button>

        <button
          type="button"
          title="Save image to file"
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
          className={cn(
            'hover:bg-bg-hover ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            dirty && !saving ? 'text-accent bg-accent/10' : 'text-fg-muted cursor-not-allowed',
          )}
        >
          <Save className="size-3.5" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {showCrop && (
        <div
          className="border-border bg-bg-secondary flex flex-wrap gap-2 rounded-lg border px-2 py-2"
          role="group"
          aria-label="Trim edges"
        >
          <TrimSlider
            label="Left"
            value={opts.crop.left}
            onChange={(v) =>
              setOpts((o) => {
                const left = Math.min(v, MAX_TRIM)
                const [L, R] = clampCropPair(left, o.crop.right)
                return { ...o, crop: { ...o.crop, left: L, right: R } }
              })
            }
          />
          <TrimSlider
            label="Right"
            value={opts.crop.right}
            onChange={(v) =>
              setOpts((o) => {
                const right = Math.min(v, MAX_TRIM)
                const [L, R] = clampCropPair(o.crop.left, right)
                return { ...o, crop: { ...o.crop, left: L, right: R } }
              })
            }
          />
          <TrimSlider
            label="Top"
            value={opts.crop.top}
            onChange={(v) =>
              setOpts((o) => {
                const top = Math.min(v, MAX_TRIM)
                const [T, B] = clampCropPair(top, o.crop.bottom)
                return { ...o, crop: { ...o.crop, top: T, bottom: B } }
              })
            }
          />
          <TrimSlider
            label="Bottom"
            value={opts.crop.bottom}
            onChange={(v) =>
              setOpts((o) => {
                const bottom = Math.min(v, MAX_TRIM)
                const [T, B] = clampCropPair(o.crop.top, bottom)
                return { ...o, crop: { ...o.crop, top: T, bottom: B } }
              })
            }
          />
        </div>
      )}

      <div
        ref={wrapRef}
        className="bg-bg-tertiary flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg p-2"
      >
        <canvas ref={displayRef} className="max-h-full max-w-full object-contain shadow-sm" />
      </div>

      <p className="text-fg-muted text-[10px] leading-snug">
        Adjustments apply on save. GIF and SVG open as a plain preview (no editor).
      </p>
    </div>
  )
}
