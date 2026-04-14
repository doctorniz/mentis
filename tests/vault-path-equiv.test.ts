import { describe, it, expect } from 'vitest'
import { vaultPathsPointToSameFile } from '@/lib/fs/vault-path-equiv'

describe('vaultPathsPointToSameFile', () => {
  it('returns true for identical strings', () => {
    expect(vaultPathsPointToSameFile('a/b.md', 'a/b.md')).toBe(true)
  })

  it('treats backslashes as slashes', () => {
    expect(vaultPathsPointToSameFile('a\\b.md', 'a/b.md')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(vaultPathsPointToSameFile('Folder/Note.MD', 'folder/note.md')).toBe(true)
  })

  it('returns false for different paths', () => {
    expect(vaultPathsPointToSameFile('a/x.md', 'a/y.md')).toBe(false)
  })
})
