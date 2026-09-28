import { describe, expect, it } from 'vitest'
import { parseMindmap, serializeMindmap, createEmptyMindmap } from '@/lib/mindmap'
import type { MindmapFile, MindmapNode, MindmapEdge } from '@/types/mindmap'

const node = (id: string, label: string, extra: Partial<MindmapNode> = {}): MindmapNode => ({
  id,
  data: { label },
  position: { x: 0, y: 0 },
  ...extra,
})
const edge = (source: string, target: string): MindmapEdge => ({
  id: `${source}>${target}`,
  source,
  target,
})

/** Structure only: labels by parent, extra links, colours, placed positions. */
function shape(file: MindmapFile) {
  const label = (id: string) => file.nodes.find((n) => n.id === id)!.data.label
  return {
    nodes: file.nodes.map((n) => ({
      label: n.data.label,
      color: n.data.color ?? null,
      placed: n.manualPosition ? n.position : null,
    })),
    edges: file.edges.map((e) => `${label(e.source)} -> ${label(e.target)}`).sort(),
    viewport: file.viewport ?? null,
  }
}

describe('.map.md format', () => {
  it('reads a hand-written nested list with no ids', () => {
    const file = parseMindmap(
      `- Central Idea\n  - Child A\n    - Grandchild\n  - Child B\n- Floating\n`,
    )
    expect(shape(file).edges).toEqual([
      'Central Idea -> Child A',
      'Central Idea -> Child B',
      'Child A -> Grandchild',
    ])
    expect(file.nodes).toHaveLength(5)
    // unplaced nodes are auto-laid out, not stacked at the origin
    const ys = new Set(file.nodes.map((n) => `${n.position.x},${n.position.y}`))
    expect(ys.size).toBe(5)
  })

  it('writes plain lines for unreferenced nodes', () => {
    const md = serializeMindmap({
      version: 1,
      nodes: [node('a', 'Root'), node('b', 'Leaf')],
      edges: [edge('a', 'b')],
    })
    expect(md).toBe('- Root\n  - Leaf\n')
  })

  it('round-trips placed, coloured and cross-linked nodes, floating roots and the viewport', () => {
    const original: MindmapFile = {
      version: 1,
      nodes: [
        node('11111111-aaaa-bbbb-cccc-000000000001', 'Central Idea'),
        node('22222222-aaaa-bbbb-cccc-000000000002', 'Child A', {
          position: { x: 320, y: 40 },
          manualPosition: true,
        }),
        node('33333333-aaaa-bbbb-cccc-000000000003', 'Child B', {
          data: { label: 'Child B', color: 'violet' },
        }),
        node('44444444-aaaa-bbbb-cccc-000000000004', 'Floating'),
      ],
      edges: [
        edge('11111111-aaaa-bbbb-cccc-000000000001', '22222222-aaaa-bbbb-cccc-000000000002'),
        edge('11111111-aaaa-bbbb-cccc-000000000001', '33333333-aaaa-bbbb-cccc-000000000003'),
        // second parent: a DAG edge the nesting can't express
        edge('22222222-aaaa-bbbb-cccc-000000000002', '33333333-aaaa-bbbb-cccc-000000000003'),
      ],
      viewport: { x: 400, y: 300, zoom: 1.25 },
    }
    const md = serializeMindmap(original)
    expect(md).toContain('- Central Idea\n')
    expect(md).toMatch(/ {2}- Child A <!--[A-Za-z0-9]+-->\n/)
    expect(md).toContain('- Floating\n')
    expect(md).not.toContain('11111111') // unreferenced root gets no id

    const back = parseMindmap(md)
    expect(shape(back)).toEqual({
      ...shape(original),
      // node order follows the list; floating stays last
      nodes: shape(original).nodes,
    })
    // and it is stable: serialise → parse → serialise gives the same text
    expect(serializeMindmap(back)).toBe(md)
  })

  it('keeps edges acyclic when nesting and drops broken links', () => {
    const md = `---\nmindmap:\n  links:\n    - [b, a]\n    - [b, missing]\n    - [a, a]\n---\n- A <!--a-->\n  - B <!--b-->\n`
    const file = parseMindmap(md)
    expect(shape(file).edges).toEqual(['A -> B', 'B -> A'])
    // re-serialising puts the back-edge in links, never in the nesting
    const again = serializeMindmap(file)
    expect(again).toMatch(/- A <!--a-->\n {2}- B <!--b-->\n$/)
    expect(again).toContain('- - b')
  })

  it('gives duplicate ids in a file fresh ones', () => {
    const file = parseMindmap(`- One <!--x-->\n- Two <!--x-->\n`)
    expect(new Set(file.nodes.map((n) => n.id)).size).toBe(2)
  })

  it('creates a starter map with a single root', () => {
    const file = parseMindmap(createEmptyMindmap())
    expect(file.nodes.map((n) => n.data.label)).toEqual(['Central Idea'])
    expect(file.viewport).toEqual({ x: 400, y: 300, zoom: 1 })
  })
})
