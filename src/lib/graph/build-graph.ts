import type { FileSystemAdapter } from '@/lib/fs'
import { extractWikiLinks, resolveWikiLinkPath } from '@/lib/markdown'
import { getFileType, FileType } from '@/types/files'

export type GraphNodeType = 'note' | 'pdf' | 'canvas' | 'pptx' | 'docx' | 'spreadsheet' | 'code'

export interface GraphNode {
  id: string
  label: string
  type: GraphNodeType
  /** Folder prefix, e.g. "daily" or "" for root notes */
  folder: string
  linkCount: number
  x: number
  y: number
  vx: number
  vy: number
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function titleFromPath(p: string): string {
  const name = p.split('/').pop() ?? p
  const ft = getFileType(name)
  // Keep extension visible for code files (same as editor-tab-from-path)
  if (ft === FileType.Code) return name
  return p.replace(/\.[^/.]+$/i, '').split('/').pop() ?? p
}

function folderFromPath(p: string): string {
  const parts = p.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

function typeFromPath(p: string): GraphNodeType {
  const name = p.split('/').pop() ?? p
  switch (getFileType(name)) {
    case FileType.Pdf:         return 'pdf'
    case FileType.Canvas:      return 'canvas'
    case FileType.Pptx:        return 'pptx'
    case FileType.Docx:        return 'docx'
    case FileType.Spreadsheet: return 'spreadsheet'
    case FileType.Code:        return 'code'
    default:                   return 'note'
  }
}

/**
 * Scan all vault files and build a graph of note connections.
 * Every file (note, PDF, canvas) becomes a node; resolved wiki-links in
 * markdown files become directed edges.
 */
export async function buildNoteGraph(
  vaultFs: FileSystemAdapter,
  allPaths: string[],
): Promise<GraphData> {
  const nodeMap = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const edgeSet = new Set<string>()

  // Create a node for every file
  for (const p of allPaths) {
    nodeMap.set(p, {
      id: p,
      label: titleFromPath(p),
      type: typeFromPath(p),
      folder: folderFromPath(p),
      linkCount: 0,
      x: Math.random() * 600 - 300,
      y: Math.random() * 600 - 300,
      vx: 0,
      vy: 0,
    })
  }

  // Build edges from wiki-links inside markdown files only
  const markdownPaths = allPaths.filter((p) => p.endsWith('.md'))

  for (const p of markdownPaths) {
    try {
      const raw = await vaultFs.readTextFile(p)
      const links = extractWikiLinks(raw)
      for (const link of links) {
        const resolved = resolveWikiLinkPath(link.target, allPaths)
        if (!resolved || resolved === p) continue

        const edgeKey = `${p}→${resolved}`
        if (edgeSet.has(edgeKey)) continue
        edgeSet.add(edgeKey)

        edges.push({ source: p, target: resolved })
        nodeMap.get(p)!.linkCount++
        if (nodeMap.has(resolved)) nodeMap.get(resolved)!.linkCount++
      }
    } catch {
      // skip unreadable files
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges }
}

/**
 * Filter graph data to only include nodes in a specific folder (and their edges).
 */
export function filterGraphByFolder(data: GraphData, folder: string): GraphData {
  const filtered = new Set<string>()
  for (const n of data.nodes) {
    if (folder === '' || n.folder === folder || n.folder.startsWith(folder + '/')) {
      filtered.add(n.id)
    }
  }
  return {
    nodes: data.nodes.filter((n) => filtered.has(n.id)),
    edges: data.edges.filter((e) => filtered.has(e.source) && filtered.has(e.target)),
  }
}

/**
 * Return the set of unique folder prefixes present in the graph.
 */
export function graphFolders(data: GraphData): string[] {
  const folders = new Set<string>()
  for (const n of data.nodes) {
    if (n.folder) folders.add(n.folder)
  }
  return ['', ...Array.from(folders).sort()]
}
