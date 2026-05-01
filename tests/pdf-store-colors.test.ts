import { describe, it, expect, beforeEach } from 'vitest'
import { usePdfStore } from '@/stores/pdf'
import { PdfTool, PdfAnnotationType, type PdfHighlight } from '@/types/pdf'

describe('pdf store highlight vs draw color (P4)', () => {
  beforeEach(() => {
    usePdfStore.getState().reset()
  })

  it('defaults draw and text to black and highlight to yellow', () => {
    expect(usePdfStore.getState().highlightColor).toBe('#fff3bf')
    expect(usePdfStore.getState().drawColor).toBe('#000000')
    expect(usePdfStore.getState().textColor).toBe('#000000')
  })

  it('keeps independent colors when switching tools', () => {
    const api = usePdfStore.getState()
    api.setActiveTool(PdfTool.Highlight)
    api.setHighlightColor('#fcc2d7')
    api.setActiveTool(PdfTool.Draw)
    expect(usePdfStore.getState().drawColor).toBe('#000000')
    api.setDrawColor('#d0ebff')
    api.setActiveTool(PdfTool.Highlight)
    expect(usePdfStore.getState().highlightColor).toBe('#fcc2d7')
    api.setActiveTool(PdfTool.Draw)
    expect(usePdfStore.getState().drawColor).toBe('#d0ebff')
  })

  it('keeps text colour independent from highlight and pen (P14)', () => {
    const api = usePdfStore.getState()
    api.setTextColor('#1864ab')
    api.setHighlightColor('#fcc2d7')
    api.setDrawColor('#2b8a3e')
    expect(usePdfStore.getState().textColor).toBe('#1864ab')
    expect(usePdfStore.getState().highlightColor).toBe('#fcc2d7')
    expect(usePdfStore.getState().drawColor).toBe('#2b8a3e')
  })
})

describe('pdf store addAnnotation fromLoader (P5)', () => {
  beforeEach(() => {
    usePdfStore.getState().reset()
  })

  it('does not set hasUnsavedChanges when hydrating from disk', () => {
    usePdfStore.getState().setDocument({
      path: 't.pdf',
      pageCount: 1,
      pages: [{ index: 0, width: 612, height: 792, rotation: 0 }],
    })
    expect(usePdfStore.getState().hasUnsavedChanges).toBe(false)
    usePdfStore.getState().addAnnotation(
      {
        id: 'h1',
        type: PdfAnnotationType.Highlight,
        pageIndex: 0,
        rect: { x: 1, y: 2, width: 10, height: 10 },
        color: '#fff3bf',
        quadPoints: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-01T00:00:00.000Z',
      } as PdfHighlight,
      { fromLoader: true },
    )
    expect(usePdfStore.getState().hasUnsavedChanges).toBe(false)
    expect(usePdfStore.getState().annotations).toHaveLength(1)
  })
})
