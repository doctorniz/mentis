import { describe, it, expect } from 'vitest'
import { sanitizeDownloadFilename } from '@/lib/browser/download-file'

describe('sanitizeDownloadFilename', () => {
  it('strips illegal filename characters', () => {
    expect(sanitizeDownloadFilename('foo/bar.md')).toBe('foo_bar.md')
    expect(sanitizeDownloadFilename('a:b?.txt')).toBe('a_b_.txt')
  })

  it('falls back when empty after strip', () => {
    expect(sanitizeDownloadFilename('  ')).toBe('download')
    expect(sanitizeDownloadFilename('')).toBe('download')
  })
})
