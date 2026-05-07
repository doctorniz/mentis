import { describe, expect, it } from 'vitest'
import {
  boardBodyIsImageOnly,
  boardExportBasenamePreferTitle,
  extractBoardVaultImagePaths,
  stripBoardImageMarkdown,
} from '@/lib/board'

describe('board vault export helpers', () => {
  it('stripBoardImageMarkdown removes images and keeps headings', () => {
    const body = '# Title\n\nHello\n\n![](_marrow/_board/_assets/a.png)\n'
    const { stripped, imageLines } = stripBoardImageMarkdown(body)
    expect(imageLines).toHaveLength(1)
    expect(stripped).toContain('# Title')
    expect(stripped).toContain('Hello')
    expect(stripped).not.toContain('![')
  })

  it('extractBoardVaultImagePaths skips http URLs', () => {
    expect(extractBoardVaultImagePaths('![](https://x/y.png)')).toEqual([])
    expect(
      extractBoardVaultImagePaths('![](_marrow/_board/_assets/a.png)'),
    ).toEqual(['_marrow/_board/_assets/a.png'])
  })

  it('boardBodyIsImageOnly allows headings only besides images', () => {
    expect(boardBodyIsImageOnly('# Hi\n\n![](x.png)')).toBe(true)
    expect(boardBodyIsImageOnly('# Hi\n\nNote text\n\n![](x.png)')).toBe(false)
  })

  it('boardExportBasenamePreferTitle prefers title stem', () => {
    expect(boardExportBasenamePreferTitle('My Photo', 'abc.png', '.png')).toBe('My Photo.png')
    expect(boardExportBasenamePreferTitle(null, 'abc.png', '.png')).toMatch(/abc\.png$/)
  })
})
