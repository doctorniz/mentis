import { describe, expect, it } from 'vitest'
import { createWikiLinkResolver } from '@/lib/markdown'
import { rewriteLinks } from '@/lib/links/rename'

const PATHS = ['Home/Shop.md', 'Work/Shop notes.md', 'Attachments/photo.png', 'Plan.list.md']
const resolve = createWikiLinkResolver(PATHS)

describe('rewriteLinks', () => {
  it('renames links by name, keeping heading, alias and embeds', () => {
    const text = 'See [[Shop]], [[shop|the list]], [[Shop#Fruit]] and ![[Shop]].'
    expect(rewriteLinks(text, 'Home/Shop.md', 'Home/Groceries.md', resolve)).toBe(
      'See [[Groceries]], [[Groceries|the list]], [[Groceries#Fruit]] and ![[Groceries]].',
    )
  })

  it('keeps a folder and an extension the link was written with', () => {
    const text = '[[Home/Shop]] [[Shop.md]]'
    expect(rewriteLinks(text, 'Home/Shop.md', 'Home/Groceries.md', resolve)).toBe(
      '[[Home/Groceries]] [[Groceries.md]]',
    )
  })

  it('renames an embedded image with its extension', () => {
    expect(
      rewriteLinks('![[photo.png]]', 'Attachments/photo.png', 'Attachments/beach.png', resolve),
    ).toBe('![[beach.png]]')
  })

  it('names a list without its suffix', () => {
    expect(rewriteLinks('[[Plan]]', 'Plan.list.md', 'Trip.list.md', resolve)).toBe('[[Trip]]')
  })

  it('leaves links to other files alone', () => {
    const text = '[[Shop notes]] [[Plan]] [[Missing]] [[Home]]'
    expect(rewriteLinks(text, 'Home/Shop.md', 'Home/Groceries.md', resolve)).toBe(text)
  })
})
