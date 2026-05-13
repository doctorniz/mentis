'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
  BackgroundVariant,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GitBranch, Plus, RotateCcw } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useEditorStore } from '@/stores/editor'
import { useAutoSave } from '@/hooks/use-auto-save'
import { InlineFileTitle } from '@/components/shell/inline-file-title'
import { cn } from '@/utils/cn'
import {
  parseMindmap,
  serializeMindmap,
  addChildNode,
  addSiblingNode,
  deleteNode,
  autoLayoutMindmap,
} from '@/lib/mindmap'
import type { MindmapFile, MindmapNode as MindmapNodeData, MindmapEdge as MindmapEdgeData } from '@/types/mindmap'
import { MindmapNodeComponent } from './mindmap-node'
import type { MindmapNodeCallbacks } from './mindmap-node'
import { toast } from '@/stores/toast'
import { MOBILE_NAV_MEDIA_QUERY } from '@/lib/browser/breakpoints'
import { useMediaQuery } from '@/lib/browser/use-media-query'

// ─── History ──────────────────────────────────────────────────────────────────

interface HistoryEntry {
  nodes: MindmapNodeData[]
  edges: MindmapEdgeData[]
}

function useHistory(initialNodes: MindmapNodeData[], initialEdges: MindmapEdgeData[]) {
  const stack = useRef<HistoryEntry[]>([{ nodes: initialNodes, edges: initialEdges }])
  const pointer = useRef(0)

  const push = useCallback((nodes: MindmapNodeData[], edges: MindmapEdgeData[]) => {
    // Drop any redo entries
    stack.current = stack.current.slice(0, pointer.current + 1)
    stack.current.push({ nodes, edges })
    if (stack.current.length > 50) stack.current.shift()
    pointer.current = stack.current.length - 1
  }, [])

  const undo = useCallback(() => {
    if (pointer.current <= 0) return null
    pointer.current--
    return stack.current[pointer.current]
  }, [])

  const redo = useCallback(() => {
    if (pointer.current >= stack.current.length - 1) return null
    pointer.current++
    return stack.current[pointer.current]
  }, [])

  const canUndo = () => pointer.current > 0
  const canRedo = () => pointer.current < stack.current.length - 1

  return { push, undo, redo, canUndo, canRedo }
}

// ─── Adapters between lib types and React Flow node/edge shapes ───────────────

function toRFNodes(
  libNodes: MindmapNodeData[],
  editingId: string | null,
  callbacks: MindmapNodeCallbacks,
): Node[] {
  return libNodes.map((n) => ({
    id: n.id,
    type: 'mindmapNode',
    position: n.position,
    data: {
      label: n.data.label,
      color: n.data.color,
      editing: n.id === editingId,
      ...callbacks,
    },
  }))
}

function toRFEdges(libEdges: MindmapEdgeData[]): Edge[] {
  return libEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    style: { stroke: 'var(--color-fg-muted)', strokeWidth: 1.5 },
    animated: false,
  }))
}

function fromRFNodes(rfNodes: Node[], libNodes: MindmapNodeData[]): MindmapNodeData[] {
  return rfNodes.map((rn) => {
    const existing = libNodes.find((n) => n.id === rn.id)
    return {
      id: rn.id,
      data: { label: (rn.data as { label: string }).label, color: (rn.data as { color?: string }).color },
      position: rn.position,
      parentId: existing?.parentId,
      manualPosition: true,
    }
  })
}

function fromRFEdges(rfEdges: Edge[]): MindmapEdgeData[] {
  return rfEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }))
}

// ─── Node types map (stable reference) ────────────────────────────────────────

const NODE_TYPES = { mindmapNode: MindmapNodeComponent }

// ─── Inner component (needs ReactFlowProvider context) ────────────────────────

interface InnerProps {
  path: string
  tabId: string
  initialFile: MindmapFile
  onRename?: (tabId: string, oldPath: string, stem: string, ext: string) => void
  onPersisted?: () => void
}

function MindmapEditorInner({ path, tabId, initialFile, onRename, onPersisted }: InnerProps) {
  const { vaultFs } = useVaultSession()
  const { fitView } = useReactFlow()
  const isMobile = useMediaQuery(MOBILE_NAV_MEDIA_QUERY)

  // ── Canonical lib-typed state ──────────────────────────────────────────────
  const libNodesRef = useRef<MindmapNodeData[]>(initialFile.nodes)
  const libEdgesRef = useRef<MindmapEdgeData[]>(initialFile.edges)
  const [editingId, setEditingId] = useState<string | null>(null)

  // ── History ────────────────────────────────────────────────────────────────
  const history = useHistory(initialFile.nodes, initialFile.edges)

  // ── Callbacks (stable) that React Flow nodes receive via data ──────────────
  const callbacks: MindmapNodeCallbacks = useMemo(
    () => ({
      onAddChild: (nodeId) => {
        const { nodes, edges, newNodeId } = addChildNode(
          libNodesRef.current,
          libEdgesRef.current,
          nodeId,
        )
        libNodesRef.current = nodes
        libEdgesRef.current = edges
        setRFNodes(toRFNodes(nodes, newNodeId, callbacks))
        setRFEdges(toRFEdges(edges))
        history.push(nodes, edges)
        setEditingId(newNodeId)
        markDirty()
      },
      onLabelChange: (nodeId, label) => {
        const updated = libNodesRef.current.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
        )
        libNodesRef.current = updated
        setRFNodes(toRFNodes(updated, null, callbacks))
        history.push(updated, libEdgesRef.current)
        markDirty()
      },
      onStartEdit: (nodeId) => setEditingId(nodeId),
      onEndEdit: () => setEditingId(null),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // ── RF state ───────────────────────────────────────────────────────────────
  const [rfNodes, setRFNodes, onNodesChange] = useNodesState(
    toRFNodes(initialFile.nodes, null, callbacks),
  )
  const [rfEdges, setRFEdges, onRFEdgesChange] = useEdgesState(toRFEdges(initialFile.edges))

  // ── Dirty / auto-save ─────────────────────────────────────────────────────
  const [isDirty, setIsDirty] = useState(false)
  const pathRef = useRef(path)
  pathRef.current = path

  function markDirty() {
    setIsDirty(true)
    useEditorStore.getState().markDirty(tabId, true)
  }

  const saveToVault = useCallback(async () => {
    if (!isDirty) return
    try {
      const file: MindmapFile = {
        version: 1,
        nodes: libNodesRef.current,
        edges: libEdgesRef.current,
        viewport: undefined,
      }
      await vaultFs.writeTextFile(pathRef.current, serializeMindmap(file))
      setIsDirty(false)
      useEditorStore.getState().markDirty(tabId, false)
      onPersisted?.()
    } catch (e) {
      console.error('Mindmap save failed', e)
      toast.error('Failed to save mindmap')
    }
  }, [isDirty, tabId, vaultFs, onPersisted])

  useAutoSave({ onSave: saveToVault, isDirty, enabled: isDirty, intervalMs: 3_000 })

  // Save on unmount
  useEffect(() => {
    return () => {
      if (!isDirty) return
      void (async () => {
        const file: MindmapFile = {
          version: 1,
          nodes: libNodesRef.current,
          edges: libEdgesRef.current,
          viewport: undefined,
        }
        await vaultFs.writeTextFile(pathRef.current, serializeMindmap(file)).catch(console.error)
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Node position drag ─────────────────────────────────────────────────────
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)
      const hasDrag = changes.some((c) => c.type === 'position' && c.dragging === false)
      if (hasDrag) {
        setRFNodes((prev) => {
          libNodesRef.current = fromRFNodes(prev, libNodesRef.current)
          history.push(libNodesRef.current, libEdgesRef.current)
          markDirty()
          return prev
        })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onNodesChange],
  )

  // ── Edge changes ──────────────────────────────────────────────────────────
  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onRFEdgesChange(changes)
      const hasDelete = changes.some((c) => c.type === 'remove')
      if (hasDelete) {
        setRFEdges((prev) => {
          libEdgesRef.current = fromRFEdges(prev)
          history.push(libNodesRef.current, libEdgesRef.current)
          markDirty()
          return prev
        })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onRFEdgesChange],
  )

  // ── New connection by dragging ─────────────────────────────────────────────
  const handleConnect = useCallback(
    (connection: Connection) => {
      const newEdge: MindmapEdgeData = {
        id: crypto.randomUUID(),
        source: connection.source!,
        target: connection.target!,
      }
      libEdgesRef.current = [...libEdgesRef.current, newEdge]
      setRFEdges((prev) => addEdge({ ...connection, type: 'smoothstep', style: { stroke: 'var(--color-fg-muted)', strokeWidth: 1.5 } }, prev))
      history.push(libNodesRef.current, libEdgesRef.current)
      markDirty()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // ── Double-click on canvas → add disconnected node ─────────────────────────
  const handlePaneDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.react-flow__node')) return
      const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const x = e.clientX - bounds.left
      const y = e.clientY - bounds.top
      const newId = crypto.randomUUID()
      const newNode: MindmapNodeData = {
        id: newId,
        data: { label: '' },
        position: { x, y },
        manualPosition: true,
      }
      libNodesRef.current = [...libNodesRef.current, newNode]
      setRFNodes((prev) => [
        ...prev,
        {
          id: newId,
          type: 'mindmapNode',
          position: { x, y },
          data: { label: '', editing: true, ...callbacks },
        },
      ])
      setEditingId(newId)
      history.push(libNodesRef.current, libEdgesRef.current)
      markDirty()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callbacks],
  )

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const active = rfNodes.find((n) => (n.selected))

      // Don't intercept when inside an input/contenteditable
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if ((e.key === 'Delete' || e.key === 'Backspace') && active && !editingId) {
        e.preventDefault()
        const { nodes, edges } = deleteNode(libNodesRef.current, libEdgesRef.current, active.id)
        libNodesRef.current = nodes
        libEdgesRef.current = edges
        setRFNodes(toRFNodes(nodes, null, callbacks))
        setRFEdges(toRFEdges(edges))
        history.push(nodes, edges)
        markDirty()
      }

      if (e.key === 'Tab' && active && !editingId) {
        e.preventDefault()
        const { nodes, edges, newNodeId } = addChildNode(
          libNodesRef.current,
          libEdgesRef.current,
          active.id,
        )
        libNodesRef.current = nodes
        libEdgesRef.current = edges
        setRFNodes(toRFNodes(nodes, newNodeId, callbacks))
        setRFEdges(toRFEdges(edges))
        history.push(nodes, edges)
        setEditingId(newNodeId)
        markDirty()
      }

      if (e.key === 'Enter' && active && !editingId) {
        e.preventDefault()
        const { nodes, edges, newNodeId } = addSiblingNode(
          libNodesRef.current,
          libEdgesRef.current,
          active.id,
        )
        libNodesRef.current = nodes
        libEdgesRef.current = edges
        setRFNodes(toRFNodes(nodes, newNodeId, callbacks))
        setRFEdges(toRFEdges(edges))
        history.push(nodes, edges)
        setEditingId(newNodeId)
        markDirty()
      }

      if (e.key === 'F2' && active && !editingId) {
        setEditingId(active.id)
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const entry = history.undo()
        if (entry) {
          libNodesRef.current = entry.nodes
          libEdgesRef.current = entry.edges
          setRFNodes(toRFNodes(entry.nodes, null, callbacks))
          setRFEdges(toRFEdges(entry.edges))
          markDirty()
        }
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault()
        const entry = history.redo()
        if (entry) {
          libNodesRef.current = entry.nodes
          libEdgesRef.current = entry.edges
          setRFNodes(toRFNodes(entry.nodes, null, callbacks))
          setRFEdges(toRFEdges(entry.edges))
          markDirty()
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void saveToVault()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfNodes, editingId, callbacks, history, saveToVault])

  // ── Sync editing node into RF state ──────────────────────────────────────
  useEffect(() => {
    setRFNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: { ...n.data, editing: n.id === editingId, ...callbacks },
      })),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, callbacks])

  // ── Reset layout ──────────────────────────────────────────────────────────
  const handleResetLayout = useCallback(() => {
    const resetNodes = libNodesRef.current.map((n) => ({ ...n, manualPosition: false }))
    const laid = autoLayoutMindmap(resetNodes, libEdgesRef.current)
    libNodesRef.current = laid
    setRFNodes(toRFNodes(laid, editingId, callbacks))
    history.push(laid, libEdgesRef.current)
    markDirty()
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, callbacks, fitView])

  // ── Add root node button ──────────────────────────────────────────────────
  const handleAddRoot = useCallback(() => {
    const newId = crypto.randomUUID()
    const lastNode = libNodesRef.current[libNodesRef.current.length - 1]
    const newNode: MindmapNodeData = {
      id: newId,
      data: { label: '' },
      position: {
        x: lastNode?.position.x ?? 0,
        y: (lastNode?.position.y ?? 0) + 120,
      },
      manualPosition: true,
    }
    libNodesRef.current = [...libNodesRef.current, newNode]
    setRFNodes((prev) => [
      ...prev,
      { id: newId, type: 'mindmapNode', position: newNode.position, data: { label: '', editing: true, ...callbacks } },
    ])
    setEditingId(newId)
    history.push(libNodesRef.current, libEdgesRef.current)
    markDirty()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callbacks])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Title bar */}
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <GitBranch className="text-teal-500 size-4 shrink-0" aria-hidden />
        <InlineFileTitle
          path={path}
          onRename={(oldPath, newStem) => onRename?.(tabId, oldPath, newStem, '.mind')}
        />
        <span className="text-fg-muted font-mono text-xs">.mind</span>
      </div>

      {/* React Flow canvas */}
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onPaneClick={() => setEditingId(null)}
          onDoubleClick={handlePaneDoubleClick}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={4}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          className="bg-bg"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            className="!text-fg-muted/20"
          />

          {!isMobile && (
            <Controls
              showInteractive={false}
              className="!border-border !bg-bg !shadow-sm [&>button]:!border-border [&>button]:!bg-bg [&>button]:!text-fg-muted"
            />
          )}

          {!isMobile && (
            <MiniMap
              nodeColor={() => 'var(--color-teal-400, #2dd4bf)'}
              maskColor="var(--color-bg)/80"
              className="!border-border !bg-bg !rounded-xl !border"
            />
          )}

          {/* Toolbar panel */}
          <Panel position="top-right">
            <div className="border-border bg-bg flex items-center gap-1.5 rounded-xl border px-2 py-1.5 shadow-sm">
              <button
                type="button"
                onClick={handleAddRoot}
                title="Add node (double-click canvas or Tab on selected)"
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                  'text-fg-muted hover:bg-bg-hover hover:text-fg',
                )}
              >
                <Plus className="size-3.5" aria-hidden />
                {!isMobile && 'Add node'}
              </button>
              <div className="bg-border h-4 w-px" />
              <button
                type="button"
                onClick={handleResetLayout}
                title="Reset layout"
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                  'text-fg-muted hover:bg-bg-hover hover:text-fg',
                )}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                {!isMobile && 'Reset layout'}
              </button>
            </div>
          </Panel>

          {/* Mobile FAB */}
          {isMobile && (
            <Panel position="bottom-right">
              <button
                type="button"
                onClick={handleAddRoot}
                aria-label="Add node"
                className={cn(
                  'flex size-14 items-center justify-center rounded-full shadow-lg',
                  'bg-teal-500 text-white active:scale-95 transition-transform',
                )}
              >
                <Plus className="size-6" aria-hidden />
              </button>
            </Panel>
          )}

          {/* Keyboard hint — desktop only */}
          {!isMobile && (
            <Panel position="bottom-left">
              <p className="text-fg-muted/60 select-none text-[10px]">
                Tab = child · Enter = sibling · F2 = rename · Del = delete · Double-click = new node
              </p>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  )
}

// ─── Public component (wraps provider) ────────────────────────────────────────

interface MindmapEditorProps {
  tabId: string
  path: string
  isNew?: boolean
  onRenamed?: () => void
  onRename?: (tabId: string, oldPath: string, stem: string, ext: string) => void
  onPersisted?: () => void
}

export function MindmapEditor({ tabId, path, onRename, onPersisted }: MindmapEditorProps) {
  const { vaultFs } = useVaultSession()
  const [file, setFile] = useState<MindmapFile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    vaultFs
      .readTextFile(path)
      .then((raw) => {
        if (cancelled) return
        try {
          setFile(parseMindmap(raw))
        } catch {
          setError('Could not parse mindmap file.')
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not read mindmap file.')
      })
    return () => {
      cancelled = true
    }
  }, [path, vaultFs])

  if (error) {
    return (
      <div className="text-fg-muted flex h-full items-center justify-center text-sm">{error}</div>
    )
  }

  if (!file) {
    return (
      <div className="text-fg-muted flex h-full items-center justify-center text-sm">
        Loading…
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <MindmapEditorInner
        path={path}
        tabId={tabId}
        initialFile={file}
        onRename={onRename}
        onPersisted={onPersisted}
      />
    </ReactFlowProvider>
  )
}
