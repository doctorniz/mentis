import { describe, expect, it } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import { uniqueVaultPath } from '@/lib/fs/unique-path'

const vault = (...taken: string[]) => {
  const set = new Set(taken)
  return { exists: async (p: string) => set.has(p) } as unknown as FileSystemAdapter
}

describe('uniqueVaultPath', () => {
  it('keeps a free path as it is', async () => {
    expect(await uniqueVaultPath(vault(), 'Notes/Plan.md')).toBe('Notes/Plan.md')
  })

  it('appends " 2", " 3", … to the stem — never "(2)"', async () => {
    const fs = vault('Notes/Plan.md', 'Notes/Plan 2.md')
    expect(await uniqueVaultPath(fs, 'Notes/Plan.md')).toBe('Notes/Plan 3.md')
  })

  it('puts the number before a compound suffix when given one', async () => {
    const fs = vault('Roadmap.kan.md')
    expect(await uniqueVaultPath(fs, 'Roadmap.kan.md', '.kan.md')).toBe('Roadmap 2.kan.md')
    expect(await uniqueVaultPath(fs, 'Roadmap.kan.md')).toBe('Roadmap.kan 2.md')
  })

  it('handles names without an extension and dot-files', async () => {
    expect(await uniqueVaultPath(vault('README'), 'README')).toBe('README 2')
    expect(await uniqueVaultPath(vault('.env'), '.env')).toBe('.env 2')
  })

  it('keeps descriptive brackets and numbers after them', async () => {
    const fs = vault('Deck (p1-3).pdf')
    expect(await uniqueVaultPath(fs, 'Deck (p1-3).pdf')).toBe('Deck (p1-3) 2.pdf')
  })
})
