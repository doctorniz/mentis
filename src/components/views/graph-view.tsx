'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useEditorStore } from '@/stores/editor'
import { useUiStore } from '@/stores/ui'
import { Button } from '@/components/ui/button'

import { ViewMode } from '@/types/vault'
import {
  buildNoteGraph,
  filterGraphByFolder,
  graphFolders,
  type GraphData,
} from '@/lib/graph/build-graph'
import { getFileType, FileType } from '@/types/files'
import { GraphCanvas } from '@/components/graph/graph-canvas'

const SKIP_PREFIXES = ['_', '.']

/** File types included in the graph (excludes image/audio/video/other). */
const GRAPH_FILE_TYPES = new Set([
  FileType.Markdown,
  FileType.Pdf,
  FileType.Canvas,
  FileType.Pptx,
  FileType.Docx,
  FileType.Spreadsheet,
  FileType.Code,
])

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
      if (GRAPH_FILE_TYPES.has(getFileType(e.name))) paths.push(fullPath)
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

  const countByType = filteredData.nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1
    return acc
  }, {})

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
      <div className="border-border bg-bg-secondary flex items-center gap-2 border-b px-2 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-fg-muted hover:text-fg size-7 shrink-0 p-0"
          onClick={() => setActiveView(ViewMode.Vault)}
          aria-label="Back to vault"
          title="Back to Vault"
        >
          <ArrowLeft className="size-3.5" />
        </Button>

        <h2 className="text-fg text-sm font-semibold">Graph</h2>

        <span className="text-fg-muted text-xs">
          {[
            countByType['note']        && `${countByType['note']} note${countByType['note'] !== 1 ? 's' : ''}`,
            countByType['pdf']         && `${countByType['pdf']} PDF${countByType['pdf'] !== 1 ? 's' : ''}`,
            countByType['canvas']      && `${countByType['canvas']} drawing${countByType['canvas'] !== 1 ? 's' : ''}`,
            countByType['pptx']        && `${countByType['pptx']} presentation${countByType['pptx'] !== 1 ? 's' : ''}`,
            countByType['docx']        && `${countByType['docx']} doc${countByType['docx'] !== 1 ? 's' : ''}`,
            countByType['spreadsheet'] && `${countByType['spreadsheet']} sheet${countByType['spreadsheet'] !== 1 ? 's' : ''}`,
            countByType['code']        && `${countByType['code']} code file${countByType['code'] !== 1 ? 's' : ''}`,
            filteredData.edges.length  && `${filteredData.edges.length} link${filteredData.edges.length !== 1 ? 's' : ''}`,
          ].filter(Boolean).join(' · ')}
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

        {/* Hint */}
        <p className="bg-bg/80 text-fg-muted pointer-events-none absolute bottom-3 left-3 rounded-md px-3 py-1.5 text-[10px] backdrop-blur-sm">
          Scroll to zoom · Drag to pan · Click to select · Double-click to open
        </p>
      </div>
    </div>
  )
}
