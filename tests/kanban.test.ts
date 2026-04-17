import { describe, expect, it } from 'vitest'
import { createEmptyKanban, parseKanban, serializeKanban } from '@/lib/kanban'

describe('kanban', () => {
  it('createEmptyKanban sets type and default column colors', () => {
    const raw = createEmptyKanban()
    const { board, frontmatter } = parseKanban(raw)
    expect(frontmatter.type).toBe('kanban')
    expect(board.columns).toHaveLength(3)
    expect(board.columns[0].color).toBe('amber')
    expect(board.columns[1].color).toBe('sky')
    expect(board.columns[2].color).toBe('emerald')
  })

  it('round-trips column colors in heading comments', () => {
    const raw = `---
type: kanban
---

## To Do <!--kanban:amber-->

- [ ] one

## Done <!--kanban:rose-->

- [x] two
`
    const { board } = parseKanban(raw)
    expect(board.columns[0].heading).toBe('To Do')
    expect(board.columns[0].color).toBe('amber')
    expect(board.columns[1].heading).toBe('Done')
    expect(board.columns[1].color).toBe('rose')

    const out = serializeKanban(board, { type: 'kanban' })
    expect(out).toContain('## To Do <!--kanban:amber-->')
    expect(out).toContain('## Done <!--kanban:rose-->')
    expect(out).toContain('- [ ] one')
    expect(out).toContain('- [x] two')
  })
})
