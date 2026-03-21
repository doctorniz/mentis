export enum PdfAnnotationType {
  Highlight = 'highlight',
  Ink = 'ink',
  FreeText = 'free-text',
  Text = 'text',
  Stamp = 'stamp',
}

export enum HighlightColor {
  Yellow = '#fff3bf',
  Green = '#d3f9d8',
  Blue = '#d0ebff',
  Pink = '#fcc2d7',
  Red = '#ffc9c9',
}

export interface PdfAnnotation {
  id: string
  type: PdfAnnotationType
  pageIndex: number
  rect: PdfRect
  color?: string
  content?: string
  createdAt: string
  modifiedAt: string
}

export interface PdfHighlight extends PdfAnnotation {
  type: PdfAnnotationType.Highlight
  color: string
  quadPoints: number[][]
  note?: string
}

export interface PdfInkAnnotation extends PdfAnnotation {
  type: PdfAnnotationType.Ink
  paths: PdfInkPath[]
  strokeColor: string
  strokeWidth: number
}

export interface PdfInkPath {
  points: { x: number; y: number }[]
}

export interface PdfFreeText extends PdfAnnotation {
  type: PdfAnnotationType.FreeText
  text: string
  fontSize: number
  fontColor: string
}

export interface PdfTextComment extends PdfAnnotation {
  type: PdfAnnotationType.Text
  text: string
}

export interface PdfStamp extends PdfAnnotation {
  type: PdfAnnotationType.Stamp
  imageData: string
}

export interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PdfPageInfo {
  index: number
  width: number
  height: number
  rotation: number
}

export interface PdfDocumentInfo {
  path: string
  pageCount: number
  title?: string
  author?: string
  pages: PdfPageInfo[]
}

export enum PdfTool {
  Select = 'select',
  Highlight = 'highlight',
  Draw = 'draw',
  Text = 'text',
  Comment = 'comment',
  Sign = 'sign',
  Erase = 'erase',
}

export interface PdfNewPageOptions {
  style: 'blank' | 'lined' | 'grid' | 'dot-grid'
  size: 'a4' | 'letter' | 'custom'
  customWidth?: number
  customHeight?: number
}

export interface Signature {
  id: string
  name: string
  imageDataUrl: string
  createdAt: string
}
