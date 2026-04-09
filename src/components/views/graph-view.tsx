'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useEditorStore } from '@/stores/editor'
import { useUiStore } from '@/stores/ui'

import { ViewMode } from '@/types/vault'
import {
  buildNoteGraph,
  filterGraphByFolder,
  graphFolders,
  type GraphData,
} from '@/lib/graph/build-graph'
import { GraphCanvas } from '@/components/graph/graph-canvas'

const SKIP_PREFIXES = ['_', '.']
const VAULT_EXTS = new Set(['.md', '.pdf', '.canvas'])

/** Recursively collect all vault files we want to show in the graph. */
async function collectVaultPaths(
  vaultFs: { readdir: (dir: string) => Promise<{ name: string; isDirectory: boolean }[]> },
  dir = '',
): Promise<string[]> {
  const paths: string[] = []
  let entries: { name: string; isDirectory: boolean }[]
  try {
    entries = await vaultFs.readdir(dir)
  } catch {
    return paths
  }

  for (const e of entries) {
    if (SKIP_PREFIXES.some((prefix) => e.name.startsWith(prefix))) continue
    const fullPath = dir ? `${dir}/${e.name}` : e.name
    if (e.isDirectory) {
      const sub = await collectVaultPaths(vaultFs, fullPath)
      paths.push(...sub)
    } else {
      const dotIdx = e.name.lastIndexOf('.')
      const ext = dotIdx >= 0 ? e.name.slice(dotIdx).toLowerCase() : ''
      if (VAULT_EXTS.has(ext)) paths.push(fullPath)
    }
  }
  return paths
}

export function GraphView() {
  const { vaultFs } = useVaultSession()
  const openTab = useEditorStore((s) => s.openTab)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const setVaultMode = useUiStore((s) => s.setVaultMode)

  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [folderFilter, setFolderFilter] = useState('')
  const hasDataRef = useRef(false)

  // Use a ref so the rebuild effect always uses the latest vaultFs without re-subscribing
  const vaultFsRef = useRef(vaultFs)
  vaultFsRef.current = vaultFs

  const [rebuildToken, setRebuildToken] = useState(0)

  // Rebuild whenever the vault changes (new file, rename, save with wiki-links)
  useEffect(() => {
    const handler = () => setRebuildToken((n) => n + 1)
    window.addEventListener('ink:vault-changed', handler)
    return () => window.removeEventListener('ink:vault-changed', handler)
  }, [])

  useEffect(() => {
    let cancelled = false
    // Show loading spinner only on the very first build; silent refresh after that
    if (!hasDataRef.current) setLoading(true)
    void (async () => {
      const allPaths = await collectVaultPaths(vaultFsRef.current)
      if (cancelled) return
      const data = await buildNoteGraph(vaultFsRef.current, allPaths)
      if (cancelled) return
      hasDataRef.current = true
      setGraphData(data)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [rebuildToken])

  const filteredData = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] }
    if (!folderFilter) return graphData
    return filterGraphByFolder(graphData, folderFilter)
  }, [graphData, folderFilter])

  const folders = useMemo(() => {
    if (!graphData) return []
    return graphFolders(graphData)
  }, [graphData])

  const handleClickNode = useCallback(
    (nodeId: string) => {
      const title = nodeId.replace(/\.(md|pdf|canvas)$/i, '').split('/').pop() ?? nodeId

      const type = nodeId.endsWith('.pdf') ? 'pdf' as const
        : nodeId.endsWith('.canvas') ? 'canvas' as const
        : 'markdown' as const

      openTab({ id: nodeId, path: nodeId, type, title, isDirty: false })
      setActiveView(ViewMode.Vault)
      setVaultMode('tree')
    },
    [openTab, setActiveView, setVaultMode],
  )

  const noteCount = filteredData.nodes.filter((n) => n.type === 'note').length
  const pdfCount = filteredData.nodes.filter((n) => n.type === 'pdf').length
  const canvasCount = filteredData.nodes.filter((n) => n.type === 'canvas').length

  if (loading) {
    return (
      <div className="text-fg-muted flex h-full items-center justify-center text-sm">
        Building graph…
      </div>
    )
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="text-fg-muted flex h-full flex-col items-center justify-center gap-2 text-sm">
        <p>No files found in vault.</p>
        <p className="text-fg-muted/70 text-xs">
          Create notes, PDFs, or drawings — they will all appear here as nodes.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="border-border bg-bg-secondary flex items-center gap-3 border-b px-3 py-2">
        <h2 className="text-fg text-sm font-semibold">Graph</h2>

        <span className="text-fg-muted text-xs">
          {noteCount > 0 && `${noteCount} note${noteCount !== 1 ? 's' : ''}`}
          {noteCount > 0 && (pdfCount > 0 || canvasCount > 0) && ' · '}
          {pdfCount > 0 && `${pdfCount} PDF${pdfCount !== 1 ? 's' : ''}`}
          {pdfCount > 0 && canvasCount > 0 && ' · '}
          {canvasCount > 0 && `${canvasCount} drawing${canvasCount !== 1 ? 's' : ''}`}
          {filteredData.edges.length > 0 && ` · ${filteredData.edges.length} link${filteredData.edges.length !== 1 ? 's' : ''}`}
        </span>

        {folders.length > 1 && (
          <select
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            className="border-border bg-bg text-fg ml-auto rounded-md border px-2 py-1 text-xs"
            aria-label="Filter by folder"
          >
            {folders.map((f) => (
              <option key={f} value={f}>
                {f || 'All folders'}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Canvas */}
      <div className="bg-bg-tertiary relative min-h-0 flex-1">
        <GraphCanvas
          nodes={filteredData.nodes}
          edges={filteredData.edges}
          onClickNode={handleClickNode}
        />

        {/* Legend */}
        <div className="bg-bg/80 text-fg-muted pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5 rounded-md px-3 py-2 text-[10px] backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full bg-blue-400 opacity-80" />
              Note
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-sm bg-red-400 opacity-80" />
              PDF
            </span>
            <span className="flex items-center gap-1">
              <DiamondIcon />
              Drawing
            </span>
          </div>
          <p>Scroll to zoom · Drag to pan · Click to select · Double-click to open</p>
        </div>
      </div>
    </div>
  )
}

function DiamondIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="opacity-80" aria-hidden>
      <polygon points="5,0 10,5 5,10 0,5" fill="#a78bfa" />
    </svg>
  )
}
