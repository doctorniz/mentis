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
import { fileTypes } from '@/core/registries'
import { resolveLinkEdges } from '@/lib/links/resolve-edges'
import { reconcileSoon } from '@/lib/search/build-vault-index'
import { getIndexLinks, getIndexManifest, whenSearchIndexOpen } from '@/lib/search/index'
import { INDEX_CHANGED_EVENTS } from '@/lib/search/index-events'
import { GraphCanvas } from '@/components/graph/graph-canvas'

const SKIP_PREFIXES = ['_', '.']

/** Types that appear in the graph, in header-count order. */
const GRAPH_TYPES = fileTypes
  .all()
  .flatMap((d) => (d.graph ? [{ id: d.id, count: d.graph.count }] : []))
  .sort((a, b) => a.count.order - b.count.order)

/** Indexed files that belong in the graph: a supported type, outside system and hidden folders. */
function graphPathsFrom(manifestPaths: readonly string[]): string[] {
  return manifestPaths
    .filter(
      (p) =>
        fileTypes.resolve(p)?.graph &&
        !p.split('/').some((seg) => SKIP_PREFIXES.some((x) => seg.startsWith(x))),
    )
    .sort()
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

  const [rebuildToken, setRebuildToken] = useState(0)

  // The index may be behind the vault (a PDF was added, sync brought files in),
  // so ask for a reconcile on open and whenever the vault changes. It announces
  // itself if it found anything, which rebuilds the graph below.
  useEffect(() => {
    reconcileSoon(vaultFs)
    const onVaultChanged = () => reconcileSoon(vaultFs)
    window.addEventListener('ink:vault-changed', onVaultChanged)
    return () => window.removeEventListener('ink:vault-changed', onVaultChanged)
  }, [vaultFs])

  useEffect(() => {
    const bump = () => setRebuildToken((n) => n + 1)
    for (const name of INDEX_CHANGED_EVENTS) window.addEventListener(name, bump)
    return () => {
      for (const name of INDEX_CHANGED_EVENTS) window.removeEventListener(name, bump)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Show loading spinner only on the very first build; silent refresh after that
    if (!hasDataRef.current) setLoading(true)
    void (async () => {
      try {
        await whenSearchIndexOpen()
        const [manifest, links] = await Promise.all([getIndexManifest(), getIndexLinks()])
        if (cancelled) return
        const paths = graphPathsFrom(manifest.map((m) => m.path))
        setGraphData(buildNoteGraph(paths, resolveLinkEdges(links, paths)))
      } catch {
        if (cancelled) return
        setGraphData({ nodes: [], edges: [] })
      }
      hasDataRef.current = true
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
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
      const title =
        nodeId
          .replace(/\.(md|pdf|canvas)$/i, '')
          .split('/')
          .pop() ?? nodeId

      const type = nodeId.endsWith('.pdf')
        ? ('pdf' as const)
        : nodeId.endsWith('.canvas')
          ? ('canvas' as const)
          : ('markdown' as const)

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
            ...GRAPH_TYPES.map(
              ({ id, count }) =>
                countByType[id] &&
                `${countByType[id]} ${countByType[id] !== 1 ? count.plural : count.singular}`,
            ),
            filteredData.edges.length &&
              `${filteredData.edges.length} link${filteredData.edges.length !== 1 ? 's' : ''}`,
          ]
            .filter(Boolean)
            .join(' · ')}
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
