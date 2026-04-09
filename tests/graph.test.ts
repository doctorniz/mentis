import { describe, it, expect, beforeEach } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs'
import type { FileEntry, FileStats } from '@/types/files'
import { buildNoteGraph, filterGraphByFolder, graphFolders } from '@/lib/graph/build-graph'

class InMemoryAdapter implements FileSystemAdapter {
  readonly type = 'opfs' as const
  files = new Map<string, Uint8Array>()

  async init() {}
  async readFile(path: string): Promise<Uint8Array> {
    const d = this.files.get(path)
    if (!d) throw new Error(`Not found: ${path}`)
    return d
  }
  async readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(path))
  }
  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, data)
  }
  async writeTextFile(path: string, content: string): Promise<void> {
    this.files.set(path, new TextEncoder().encode(content))
  }
  async exists(path: string): Promise<boolean> { return this.files.has(path) }
  async stat(path: string): Promise<FileStats> {
    return { size: this.files.get(path)?.length ?? 0, modifiedAt: Date.now(), isDirectory: false }
  }
  async mkdir(): Promise<void> {}
  async readdir(): Promise<FileEntry[]> { return [] }
  async rename(): Promise<void> {}
  async copy(): Promise<void> {}
  async remove(): Promise<void> {}
  async removeDir(): Promise<void> {}
}

describe('buildNoteGraph', () => {
  let fs: InMemoryAdapter
  const paths = ['notes/a.md', 'notes/b.md', 'notes/c.md', 'daily/d.md']

  beforeEach(() => {
    fs = new InMemoryAdapter()
    fs.writeTextFile('notes/a.md', '# A\nLink to [[b]] and [[c]]')
    fs.writeTextFile('notes/b.md', '# B\nLink to [[a]]')
    fs.writeTextFile('notes/c.md', '# C\nNo links here')
    fs.writeTextFile('daily/d.md', '# D\nLink to [[a]]')
  })

  it('creates a node for every markdown path', async () => {
    const graph = await buildNoteGraph(fs, paths)
    expect(graph.nodes).toHaveLength(4)
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(paths.sort())
  })

  it('derives labels from filenames', async () => {
    const graph = await buildNoteGraph(fs, paths)
    const labels = graph.nodes.map((n) => n.label).sort()
    expect(labels).toEqual(['a', 'b', 'c', 'd'])
  })

  it('derives folder from path', async () => {
    const graph = await buildNoteGraph(fs, paths)
    const d = graph.nodes.find((n) => n.id === 'daily/d.md')
    expect(d?.folder).toBe('daily')
    const a = graph.nodes.find((n) => n.id === 'notes/a.md')
    expect(a?.folder).toBe('notes')
  })

  it('creates edges for resolved wiki-links', async () => {
    const graph = await buildNoteGraph(fs, paths)
    expect(graph.edges.length).toBeGreaterThanOrEqual(3)
    const aToB = graph.edges.find((e) => e.source === 'notes/a.md' && e.target === 'notes/b.md')
    expect(aToB).toBeDefined()
  })

  it('does not create duplicate edges', async () => {
    fs.writeTextFile('notes/a.md', '# A\n[[b]] [[b]] [[b]]')
    const graph = await buildNoteGraph(fs, paths)
    const aToBCount = graph.edges.filter(
      (e) => e.source === 'notes/a.md' && e.target === 'notes/b.md',
    ).length
    expect(aToBCount).toBe(1)
  })

  it('does not create self-links', async () => {
    fs.writeTextFile('notes/a.md', '# A\n[[a]]')
    const graph = await buildNoteGraph(fs, paths)
    const selfLinks = graph.edges.filter((e) => e.source === e.target)
    expect(selfLinks).toHaveLength(0)
  })

  it('counts links per node', async () => {
    const graph = await buildNoteGraph(fs, paths)
    const a = graph.nodes.find((n) => n.id === 'notes/a.md')!
    expect(a.linkCount).toBeGreaterThanOrEqual(2)
    const c = graph.nodes.find((n) => n.id === 'notes/c.md')!
    expect(c.linkCount).toBeGreaterThanOrEqual(1)
  })

  it('handles empty vault', async () => {
    const graph = await buildNoteGraph(fs, [])
    expect(graph.nodes).toHaveLength(0)
    expect(graph.edges).toHaveLength(0)
  })

  it('skips unresolvable links', async () => {
    fs.writeTextFile('notes/a.md', '# A\n[[nonexistent]]')
    const graph = await buildNoteGraph(fs, paths)
    const fromA = graph.edges.filter((e) => e.source === 'notes/a.md')
    expect(fromA).toHaveLength(0)
  })
})

describe('filterGraphByFolder', () => {
  it('returns all nodes when folder is empty string', async () => {
    const fs = new InMemoryAdapter()
    fs.writeTextFile('notes/a.md', '[[b]]')
    fs.writeTextFile('notes/b.md', '')
    fs.writeTextFile('daily/c.md', '[[a]]')
    const graph = await buildNoteGraph(fs, ['notes/a.md', 'notes/b.md', 'daily/c.md'])

    const filtered = filterGraphByFolder(graph, '')
    expect(filtered.nodes).toHaveLength(3)
  })

  it('filters to matching folder', async () => {
    const fs = new InMemoryAdapter()
    fs.writeTextFile('notes/a.md', '[[b]]')
    fs.writeTextFile('notes/b.md', '')
    fs.writeTextFile('daily/c.md', '[[a]]')
    const graph = await buildNoteGraph(fs, ['notes/a.md', 'notes/b.md', 'daily/c.md'])

    const filtered = filterGraphByFolder(graph, 'notes')
    expect(filtered.nodes).toHaveLength(2)
    expect(filtered.nodes.every((n) => n.folder === 'notes')).toBe(true)
  })

  it('only includes edges between included nodes', async () => {
    const fs = new InMemoryAdapter()
    fs.writeTextFile('notes/a.md', '[[b]]')
    fs.writeTextFile('notes/b.md', '')
    fs.writeTextFile('daily/c.md', '[[a]]')
    const graph = await buildNoteGraph(fs, ['notes/a.md', 'notes/b.md', 'daily/c.md'])

    const filtered = filterGraphByFolder(graph, 'notes')
    for (const e of filtered.edges) {
      expect(filtered.nodes.some((n) => n.id === e.source)).toBe(true)
      expect(filtered.nodes.some((n) => n.id === e.target)).toBe(true)
    }
  })
})

describe('graphFolders', () => {
  it('returns unique folder names with empty string for all', async () => {
    const fs = new InMemoryAdapter()
    fs.writeTextFile('notes/a.md', '')
    fs.writeTextFile('daily/b.md', '')
    fs.writeTextFile('c.md', '')
    const graph = await buildNoteGraph(fs, ['notes/a.md', 'daily/b.md', 'c.md'])

    const folders = graphFolders(graph)
    expect(folders[0]).toBe('')
    expect(folders).toContain('notes')
    expect(folders).toContain('daily')
  })
})
