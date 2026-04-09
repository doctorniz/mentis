import { describe, it, expect } from 'vitest'
import { getFileType, isHiddenPath, FileType } from '@/types/files'
import { ok, err } from '@/lib/fs/types'

describe('getFileType', () => {
  it('identifies markdown files', () => {
    expect(getFileType('notes.md')).toBe(FileType.Markdown)
    expect(getFileType('README.markdown')).toBe(FileType.Markdown)
  })

  it('identifies PDF files', () => {
    expect(getFileType('paper.pdf')).toBe(FileType.Pdf)
  })

  it('identifies canvas files', () => {
    expect(getFileType('board.canvas')).toBe(FileType.Canvas)
  })

  it('identifies image files', () => {
    expect(getFileType('photo.png')).toBe(FileType.Image)
    expect(getFileType('photo.jpg')).toBe(FileType.Image)
    expect(getFileType('photo.jpeg')).toBe(FileType.Image)
    expect(getFileType('photo.gif')).toBe(FileType.Image)
    expect(getFileType('photo.webp')).toBe(FileType.Image)
    expect(getFileType('icon.svg')).toBe(FileType.Image)
  })

  it('returns Other for unknown extensions', () => {
    expect(getFileType('data.json')).toBe(FileType.Other)
    expect(getFileType('script.js')).toBe(FileType.Other)
    expect(getFileType('noext')).toBe(FileType.Other)
  })

  it('is case insensitive', () => {
    expect(getFileType('FILE.MD')).toBe(FileType.Markdown)
    expect(getFileType('DOC.PDF')).toBe(FileType.Pdf)
  })
})

describe('isHiddenPath', () => {
  it('detects _marrow paths', () => {
    expect(isHiddenPath('_marrow/config.json')).toBe(true)
    expect(isHiddenPath('vault/_marrow/data')).toBe(true)
  })

  it('detects _assets paths', () => {
    expect(isHiddenPath('_assets/img.png')).toBe(true)
    expect(isHiddenPath('notes/_assets/file')).toBe(true)
  })

  it('allows normal paths', () => {
    expect(isHiddenPath('notes/hello.md')).toBe(false)
    expect(isHiddenPath('journal/2026-01-01.md')).toBe(false)
  })

  it('does not match partial names', () => {
    expect(isHiddenPath('my_marrow_stuff/file')).toBe(false)
    expect(isHiddenPath('pre_assets/file')).toBe(false)
  })
})

describe('Result type helpers', () => {
  it('ok wraps a value', () => {
    const r = ok(42)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(42)
  })

  it('err wraps an error', () => {
    const r = err(new Error('fail'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('fail')
  })
})
