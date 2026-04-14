'use client'

import { useEffect, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Bold,
  ChevronDown,
  Download,
  Eraser,
  ImagePlus,
  Italic,
  MousePointer2,
  Pencil,
  Redo2,
  Type,
  Underline,
  Undo2,
} from 'lucide-react'
import { useCanvasStore, type CanvasActiveTool } from '@/stores/canvas'
import { cn } from '@/utils/cn'

/** Live state for the text-formatting strip (plain + sticky text boxes only). */
export type CanvasTextBarState = {
  fontSize: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  underline: boolean
  fill: string
}

const FONT_CHOICES = [
  { value: 'system-ui, sans-serif', label: 'System' },
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times' },
  { value: '"Courier New", monospace', label: 'Courier' },
  { value: 'ui-monospace, monospace', label: 'Mono' },
]

const FONT_SIZES = [10, 12, 14, 16, 18, 24, 32, 48] as const

const TOOLS: { id: CanvasActiveTool; icon: typeof Pencil; label: string; key: string; hint?: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', key: 'V', hint: 'Move and resize objects. Double-click text to edit.' },
  { id: 'draw', icon: Pencil, label: 'Draw', key: 'P' },
  { id: 'text', icon: Type, label: 'Text', key: 'T', hint: 'Click the canvas to place. Then you are in Select: drag to move, double-click to edit.' },
  { id: 'erase', icon: Eraser, label: 'Erase', key: 'E' },
]

const PALETTE = [
  '#000000', '#343a40', '#868e96', '#ced4da', '#f8f9fa', '#ffffff',
  '#e03131', '#f76707', '#fcc419', '#40c057', '#1c7ed6', '#7950f2',
  '#ff8787', '#ffa94d', '#ffe066', '#8ce99a', '#74c0fc', '#b197fc',
  '#d6336c', '#ae3ec9', '#0ca678', '#1098ad', '#3b5bdb', '#862e9c',
]

const GLASS = 'bg-neutral-900/75 backdrop-blur-xl border border-white/[0.08] shadow-2xl'

const fontMenuContentClass = cn(
  'z-[100] min-w-[10.5rem] rounded-lg border border-white/15 bg-neutral-950/95 p-1 shadow-xl backdrop-blur-md',
)

const fontMenuItemClass = cn(
  'flex cursor-pointer items-center rounded-md px-2.5 py-1.5 text-left text-sm outline-none',
  'text-white/90 data-[highlighted]:bg-white/15 data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
)

function fontFamilyTriggerMeta(fontFamily: string): { label: string; previewFamily: string } {
  const preset = FONT_CHOICES.find((f) => f.value === fontFamily)
  if (preset) return { label: preset.label, previewFamily: preset.value }
  return { label: 'Custom', previewFamily: fontFamily }
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function CanvasToolbar({
  onAddImage,
  onExportPng,
  onExportPdf,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  textBar,
  onTextStyleChange,
}: {
  onAddImage: () => void
  onExportPng: () => void
  onExportPdf: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  textBar: CanvasTextBarState | null
  onTextStyleChange: (patch: Partial<CanvasTextBarState>) => void
}) {
  const activeTool = useCanvasStore((s) => s.activeTool)
  const strokeColor = useCanvasStore((s) => s.strokeColor)
  const strokeWidth = useCanvasStore((s) => s.strokeWidth)
  const strokeOpacity = useCanvasStore((s) => s.strokeOpacity)
  const setActiveTool = useCanvasStore((s) => s.setActiveTool)
  const setStrokeColor = useCanvasStore((s) => s.setStrokeColor)
  const setStrokeWidth = useCanvasStore((s) => s.setStrokeWidth)
  const setStrokeOpacity = useCanvasStore((s) => s.setStrokeOpacity)


  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [hexInput, setHexInput] = useState(strokeColor)
  const pickerRef = useRef<HTMLDivElement>(null)
  const colorBtnRef = useRef<HTMLButtonElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const exportBtnRef = useRef<HTMLButtonElement>(null)

  const showBrushControls = activeTool === 'draw'

  useEffect(() => setHexInput(strokeColor), [strokeColor])

  useEffect(() => {
    if (!colorPickerOpen) return
    function handle(e: MouseEvent) {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        colorBtnRef.current && !colorBtnRef.current.contains(e.target as Node)
      ) setColorPickerOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [colorPickerOpen])

  useEffect(() => {
    if (!exportOpen) return
    function handle(e: MouseEvent) {
      if (
        exportRef.current && !exportRef.current.contains(e.target as Node) &&
        exportBtnRef.current && !exportBtnRef.current.contains(e.target as Node)
      ) setExportOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [exportOpen])

  function commitHex() {
    const h = hexInput.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(h)) setStrokeColor(h)
    else setHexInput(strokeColor)
  }

  const displayColor = strokeOpacity < 1
    ? hexToRgba(strokeColor, strokeOpacity)
    : strokeColor

  const boldOn = Boolean(textBar && (textBar.fontWeight === 'bold' || textBar.fontWeight === '700'))
  const italicOn = Boolean(textBar && textBar.fontStyle === 'italic')
  const roundedSize = textBar ? Math.round(textBar.fontSize) : 16
  const sizeOptions = textBar
    ? [...new Set([...FONT_SIZES, roundedSize])].sort((a, b) => a - b)
    : []
  const fontTriggerMeta = textBar ? fontFamilyTriggerMeta(textBar.fontFamily) : null

  return (
    <>
      {textBar && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[76px] z-20 flex justify-center px-2">
          <div
            className={cn(
              'pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-2xl px-2 py-1.5',
              GLASS,
            )}
            role="toolbar"
            aria-label="Text formatting"
          >
            <button
              type="button"
              title="Bold"
              aria-label="Bold"
              aria-pressed={boldOn}
              onClick={() =>
                onTextStyleChange({ fontWeight: boldOn ? 'normal' : 'bold' })
              }
              className={cn(
                'rounded-lg p-2 transition-all',
                boldOn ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white/90',
              )}
            >
              <Bold className="size-[16px]" strokeWidth={2} />
            </button>
            <button
              type="button"
              title="Italic"
              aria-label="Italic"
              aria-pressed={italicOn}
              onClick={() =>
                onTextStyleChange({ fontStyle: italicOn ? 'normal' : 'italic' })
              }
              className={cn(
                'rounded-lg p-2 transition-all',
                italicOn ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white/90',
              )}
            >
              <Italic className="size-[16px]" strokeWidth={2} />
            </button>
            <button
              type="button"
              title="Underline"
              aria-label="Underline"
              aria-pressed={textBar.underline}
              onClick={() => onTextStyleChange({ underline: !textBar.underline })}
              className={cn(
                'rounded-lg p-2 transition-all',
                textBar.underline ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white/90',
              )}
            >
              <Underline className="size-[16px]" strokeWidth={2} />
            </button>

            <div className="mx-0.5 h-5 w-px bg-white/10" aria-hidden />

            <label className="text-white/50 flex items-center gap-1 text-[10px] uppercase tracking-wide">
              <span className="sr-only">Size</span>
              <select
                value={roundedSize}
                onChange={(e) => onTextStyleChange({ fontSize: Number(e.target.value) })}
                className="max-w-[4.5rem] cursor-pointer rounded-lg border border-white/15 bg-white/10 px-1.5 py-1 text-xs text-white/90 outline-none focus:border-white/30"
              >
                {sizeOptions.map((sz) => (
                  <option key={sz} value={sz} className="bg-neutral-900">
                    {sz}
                  </option>
                ))}
              </select>
            </label>

            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label="Font family"
                  title="Font family"
                  className="flex max-w-[140px] min-w-[6.5rem] cursor-pointer items-center justify-between gap-1 rounded-lg border border-white/15 bg-white/10 px-1.5 py-1 text-left text-xs text-white/90 outline-none focus:border-white/30 focus-visible:ring-1 focus-visible:ring-white/30"
                >
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{ fontFamily: fontTriggerMeta!.previewFamily }}
                  >
                    {fontTriggerMeta!.label}
                  </span>
                  <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="top"
                  align="start"
                  sideOffset={6}
                  className={fontMenuContentClass}
                >
                  {FONT_CHOICES.map((f) => (
                    <DropdownMenu.Item
                      key={f.value}
                      className={fontMenuItemClass}
                      style={{ fontFamily: f.value }}
                      onSelect={() => onTextStyleChange({ fontFamily: f.value })}
                    >
                      {f.label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <label className="flex cursor-pointer items-center pl-1">
              <span className="sr-only">Text color</span>
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(textBar.fill) ? textBar.fill : '#212529'}
                onChange={(e) => onTextStyleChange({ fill: e.target.value })}
                title="Text color"
                className={cn(
                  'box-border size-7 cursor-pointer rounded-md border border-white/20 p-0',
                  'appearance-none bg-transparent',
                  '[&::-webkit-color-swatch-wrapper]:border-none [&::-webkit-color-swatch-wrapper]:p-0',
                  '[&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none',
                  '[&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-none',
                )}
              />
            </label>
          </div>
        </div>
      )}

      {/* ===== Bottom Center: Tool Dock + placement hints (C3) ===== */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-col items-center justify-end gap-2">
        {activeTool === 'text' && (
          <p
            className="max-w-sm px-3 text-center text-[11px] leading-snug text-white/85 drop-shadow-md"
            role="status"
          >
            Click the canvas to place a text box. You’ll switch to{' '}
            <span className="font-semibold text-white">Select</span> — drag to move,{' '}
            <span className="font-semibold text-white">double-click</span> to edit.
          </p>
        )}
        <div
          className={cn('pointer-events-auto flex items-center gap-0.5 rounded-2xl px-1.5 py-1', GLASS)}
          role="toolbar"
          aria-label="Canvas tools"
        >
          {TOOLS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                title={t.hint ? `${t.label} (${t.key}) — ${t.hint}` : `${t.label} (${t.key})`}
                aria-label={t.label}
                onClick={() => setActiveTool(t.id)}
                className={cn(
                  'rounded-xl p-2 transition-all',
                  activeTool === t.id
                    ? 'bg-white/15 text-white shadow-inner'
                    : 'text-white/60 hover:bg-white/10 hover:text-white/90',
                )}
              >
                <Icon className="size-[18px]" strokeWidth={activeTool === t.id ? 2.2 : 1.8} />
              </button>
            )
          })}

          <div className="mx-0.5 h-5 w-px bg-white/10" aria-hidden />

          {[
            { icon: ImagePlus, label: 'Image', action: onAddImage },
          ].map((a) => {
            const Icon = a.icon
            return (
              <button
                key={a.label}
                type="button"
                title={a.label}
                aria-label={a.label}
                onClick={a.action}
                className="rounded-xl p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white/90"
              >
                <Icon className="size-[18px]" strokeWidth={1.8} />
              </button>
            )
          })}

          {showBrushControls && (
            <>
              <div className="mx-0.5 h-5 w-px bg-white/10" aria-hidden />

              <button
                ref={colorBtnRef}
                type="button"
                title="Color & brush"
                aria-label="Open color picker"
                onClick={() => setColorPickerOpen((o) => !o)}
                className={cn(
                  'size-7 rounded-full border-2 transition-transform hover:scale-110',
                  colorPickerOpen ? 'scale-110 border-white' : 'border-white/30',
                )}
                style={{ backgroundColor: displayColor }}
              />

              <div className="flex items-center gap-1.5 pl-1">
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/20 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  aria-label="Brush size"
                />
                <span className="w-5 text-center font-mono text-[10px] text-white/50">{strokeWidth}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== Color Picker Popover ===== */}
      {colorPickerOpen && (
        <div
          ref={pickerRef}
          className={cn(
            'pointer-events-auto absolute bottom-[72px] left-1/2 z-30 w-[230px] -translate-x-1/2 rounded-2xl p-3',
            GLASS,
          )}
        >
          <div className="grid grid-cols-6 gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => { setStrokeColor(c); setHexInput(c) }}
                className={cn(
                  'size-7 rounded-full border-2 transition-all hover:scale-110',
                  strokeColor === c ? 'scale-110 border-white' : 'border-transparent',
                  c === '#ffffff' && 'ring-1 ring-white/20',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div
              className="size-6 shrink-0 rounded-md border border-white/20"
              style={{ backgroundColor: displayColor }}
            />
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={commitHex}
              onKeyDown={(e) => { if (e.key === 'Enter') commitHex() }}
              className="flex-1 rounded-lg bg-white/10 px-2 py-1 font-mono text-xs text-white/80 outline-none focus:bg-white/15"
              maxLength={7}
              aria-label="Hex color"
            />
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-white/50">
              <span>Opacity</span>
              <span>{Math.round(strokeOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(strokeOpacity * 100)}
              onChange={(e) => setStrokeOpacity(Number(e.target.value) / 100)}
              className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              aria-label="Stroke opacity"
            />
          </div>

          {/* Brush size preview */}
          <div className="mt-3 flex items-center justify-center">
            <div className="flex size-14 items-center justify-center rounded-lg bg-white/5">
              <div
                className="rounded-full"
                style={{
                  width: Math.max(2, Math.min(48, strokeWidth * 1.5)),
                  height: Math.max(2, Math.min(48, strokeWidth * 1.5)),
                  backgroundColor: displayColor,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===== Top Right: Actions ===== */}
      <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-2">
        <div className={cn('pointer-events-auto flex items-center gap-0.5 rounded-xl px-1 py-0.5', GLASS)}>
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            disabled={!canUndo}
            onClick={onUndo}
            className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 disabled:text-white/20"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={onRedo}
            className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 disabled:text-white/20"
          >
            <Redo2 className="size-4" />
          </button>
        </div>

        <div className="relative">
          <button
            ref={exportBtnRef}
            type="button"
            title="Export"
            onClick={() => setExportOpen((o) => !o)}
            className={cn(
              'pointer-events-auto flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:text-white/90',
              GLASS,
            )}
          >
            <Download className="size-3.5" />
            Export
          </button>
          {exportOpen && (
            <div
              ref={exportRef}
              className={cn('pointer-events-auto absolute top-full right-0 mt-1.5 flex min-w-[140px] flex-col rounded-xl py-1', GLASS)}
            >
              <button
                type="button"
                onClick={() => { onExportPng(); setExportOpen(false) }}
                className="px-4 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white"
              >
                Export as PNG
              </button>
              <button
                type="button"
                onClick={() => { onExportPdf(); setExportOpen(false) }}
                className="px-4 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white"
              >
                Export as PDF
              </button>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
