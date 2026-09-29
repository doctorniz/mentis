import { describe, it, expect } from 'vitest'
import { buildNoteGraph, filterGraphByFolder, graphFolders } from '@/lib/graph/build-graph'
import { resolveLinkEdges } from '@/lib/links/resolve-edges'
import { extractLinkTargets } from '@/lib/markdown/parse'

/** The pipeline as the app runs it: links extracted per file, resolved against the paths. */
function graphOf(files: Record<string, string>) {
  const paths = Object.keys(files)
  const rows = paths.flatMap((source) =>
    extractLinkTargets(files[source]).map((target) => ({ source, target })),
  )
  return buildNoteGraph(paths, resolveLinkEdges(rows, paths))
}

const FILES = {
  'notes/a.md': '# A\nLink to [[b]] and [[c]]',
  'notes/b.md': '# B\nLink to [[a]]',
  'notes/c.md': '# C\nNo links here',
  'daily/d.md': '# D\nLink to [[a]]',
}

describe('buildNoteGraph', () => {
  it('creates a node for every path', () => {
    const graph = graphOf(FILES)
    expect(graph.nodes).toHaveLength(4)
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(Object.keys(FILES).sort())
  })

  it('derives labels from filenames', () => {
    const labels = graphOf(FILES)
      .nodes.map((n) => n.label)
      .sort()
    expect(labels).toEqual(['a', 'b', 'c', 'd'])
  })

  it('derives folder from path', () => {
    const graph = graphOf(FILES)
    expect(graph.nodes.find((n) => n.id === 'daily/d.md')?.folder).toBe('daily')
    expect(graph.nodes.find((n) => n.id === 'notes/a.md')?.folder).toBe('notes')
  })

  it('creates edges for resolved wiki-links', () => {
    const graph = graphOf(FILES)
    expect(graph.edges).toHaveLength(4)
    expect(
      graph.edges.find((e) => e.source === 'notes/a.md' && e.target === 'notes/b.md'),
    ).toBeDefined()
  })

  it('does not create duplicate edges', () => {
    const graph = graphOf({ ...FILES, 'notes/a.md': '# A\n[[b]] [[b]] [[B]]' })
    const aToB = graph.edges.filter((e) => e.source === 'notes/a.md' && e.target === 'notes/b.md')
    expect(aToB).toHaveLength(1)
  })

  it('does not create self-links', () => {
    const graph = graphOf({ ...FILES, 'notes/a.md': '# A\n[[a]]' })
    expect(graph.edges.filter((e) => e.source === e.target)).toHaveLength(0)
  })

  it('counts a link on both of its ends', () => {
    const graph = graphOf(FILES)
    // a: to b, to c, from b, from d
    expect(graph.nodes.find((n) => n.id === 'notes/a.md')!.linkCount).toBe(4)
    expect(graph.nodes.find((n) => n.id === 'notes/c.md')!.linkCount).toBe(1)
  })

  it('handles an empty vault', () => {
    const graph = buildNoteGraph([], [])
    expect(graph.nodes).toHaveLength(0)
    expect(graph.edges).toHaveLength(0)
  })

  it('skips unresolvable links', () => {
    const graph = graphOf({ ...FILES, 'notes/a.md': '# A\n[[nonexistent]]' })
    expect(graph.edges.filter((e) => e.source === 'notes/a.md')).toHaveLength(0)
  })

  it('ignores edges that name a path with no node', () => {
    const graph = buildNoteGraph(['a.md'], [{ source: 'a.md', target: 'gone.md' }])
    expect(graph.edges).toHaveLength(0)
    expect(graph.nodes[0].linkCount).toBe(0)
  })

  it('links a note to a file that has no links of its own', () => {
    const graph = graphOf({ 'a.md': '[[Report]]', 'Report.pdf': '' })
    expect(graph.edges).toEqual([{ source: 'a.md', target: 'Report.pdf' }])
  })
})

describe('filterGraphByFolder', () => {
  const files = { 'notes/a.md': '[[b]]', 'notes/b.md': '', 'daily/c.md': '[[a]]' }

  it('returns all nodes when folder is empty string', () => {
    expect(filterGraphByFolder(graphOf(files), '').nodes).toHaveLength(3)
  })

  it('filters to matching folder', () => {
    const filtered = filterGraphByFolder(graphOf(files), 'notes')
    expect(filtered.nodes).toHaveLength(2)
    expect(filtered.nodes.every((n) => n.folder === 'notes')).toBe(true)
  })

  it('only includes edges between included nodes', () => {
    const filtered = filterGraphByFolder(graphOf(files), 'notes')
    expect(filtered.edges).toEqual([{ source: 'notes/a.md', target: 'notes/b.md' }])
  })
})

describe('graphFolders', () => {
  it('returns unique folder names with empty string for all', () => {
    const folders = graphFolders(graphOf({ 'notes/a.md': '', 'daily/b.md': '', 'c.md': '' }))
    expect(folders[0]).toBe('')
    expect(folders).toContain('notes')
    expect(folders).toContain('daily')
  })
})
