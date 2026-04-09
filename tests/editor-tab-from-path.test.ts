import { describe, it, expect } from 'vitest'
import { editorTabTypeFromVaultPath, titleFromVaultPath } from '@/lib/notes/editor-tab-from-path'

describe('editorTabTypeFromVaultPath', () => {
  it('maps extensions to tab types', () => {
    expect(editorTabTypeFromVaultPath('a/b/note.md')).toBe('markdown')
    expect(editorTabTypeFromVaultPath('x.markdown')).toBe('markdown')
    expect(editorTabTypeFromVaultPath('doc.pdf')).toBe('pdf')
    expect(editorTabTypeFromVaultPath('board.canvas')).toBe('canvas')
    expect(editorTabTypeFromVaultPath('_assets/photo.png')).toBe('image')
    expect(editorTabTypeFromVaultPath('img.JPEG')).toBe('image')
    expect(editorTabTypeFromVaultPath('data.json')).toBe('markdown')
  })
})

describe('titleFromVaultPath', () => {
  it('strips final extension from basename', () => {
    expect(titleFromVaultPath('folder/hello.md')).toBe('hello')
    expect(titleFromVaultPath('snap.png')).toBe('snap')
    expect(titleFromVaultPath('noext')).toBe('noext')
  })
})
