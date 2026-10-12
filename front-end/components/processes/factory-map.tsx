"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { Broadcast, Flag, Package, Save } from "@/lib/icons"
import { saveMapLayout } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { ProcessStatusBadge } from "@/components/processes/process-status-badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { formatCapacity } from "@/lib/utils"
import type { Department, Process, ProductFlow } from "@/lib/types"

const COLORS = ["#f59e0b", "#38bdf8", "#34d399", "#a78bfa", "#f97316", "#14b8a6", "#fb7185"]
const NODE_WIDTH = 220
const NODE_HEIGHT = 104
const HEADER = 48
const PAD = 24
const GAP = 20
const SLACK_X = 140 // free room right of the last process so it can be dragged further
const SLACK_Y = 70
const MIN_WIDTH = 320
const MIN_HEIGHT = 190
const REFRESH_MS = 10_000

type DepartmentData = { name: string; count: number; color: string; empty: boolean }
type ProcessData = { process: Process; color: string; products: { color: string; label: string; final: boolean }[] }
type DepartmentNode = Node<DepartmentData, "department">
type ProcessNode = Node<ProcessData, "process">
type MapNode = DepartmentNode | ProcessNode

function DepartmentNodeView({ data }: NodeProps<DepartmentNode>) {
  return (
    <div className="size-full border-2 border-dashed" style={{ borderColor: data.color, backgroundColor: `${data.color}14` }}>
      <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ height: HEADER }}>
        <p className="truncate text-sm font-semibold uppercase tracking-[0.14em]">{data.name}</p>
        <span className="text-xs text-muted-foreground">
          {data.count} {data.count === 1 ? "process" : "processes"}
        </span>
      </div>
      {data.empty ? (
        <p className="px-4 text-center text-sm text-muted-foreground">No processes in this department yet</p>
      ) : null}
    </div>
  )
}

function ProcessNodeView({ data }: NodeProps<ProcessNode>) {
  const { process, color } = data
  const inactive = process.status === "inactive"
  return (
    <div
      className={`relative border bg-card p-3 shadow-sm ${inactive ? "border-dashed opacity-50" : ""}`}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT, borderLeft: `4px solid ${color}` }}
    >
      <Handle type="target" position={Position.Left} />
      <span className="absolute -top-2.5 -right-2.5 border bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground" title="Instances running in parallel">
        x{process.quantity}
      </span>
      {data.products.some((product) => product.final) ? (
        <span className="absolute -top-3 -left-3 flex">
          {data.products
            .filter((product) => product.final)
            .map((product) => (
              <span
                key={product.label}
                title={`Cycle of ${product.label} ends here`}
                className="flex size-6 items-center justify-center border-2 border-card text-white"
                style={{ backgroundColor: product.color }}
              >
                <Flag className="size-3.5" />
              </span>
            ))}
        </span>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{process.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {process.code} · <span className="capitalize">{process.type}</span>
            {process.rrtEnabled ? (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-emerald-500" title="Receives live data (RRT)">
                <Broadcast className="size-3" />
                RRT
              </span>
            ) : null}
          </p>
        </div>
        <ProcessStatusBadge status={process.status} />
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">Capacity: {formatCapacity(process.capacity)}</p>
      {data.products.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Products passing through this process">
          {data.products.map((product) => (
            <span key={product.label} title={product.final ? `${product.label} (cycle ends here)` : product.label} className="size-2.5" style={{ backgroundColor: product.color }} />
          ))}
        </div>
      ) : null}
      <Link href={`/processes/${process.id}`} className="nodrag mt-1 inline-block text-xs font-medium text-primary">
        Open process
      </Link>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { department: DepartmentNodeView, process: ProcessNodeView }

function departmentSize(children: MapNode[]) {
  const right = Math.max(0, ...children.map((child) => child.position.x + NODE_WIDTH))
  const bottom = Math.max(0, ...children.map((child) => child.position.y + NODE_HEIGHT))
  return {
    width: Math.max(MIN_WIDTH, right + PAD + (children.length ? SLACK_X : 0)),
    height: Math.max(MIN_HEIGHT, bottom + PAD + (children.length ? SLACK_Y : 0)),
  }
}

/** Fits every department box around its visible processes (called after drags and toggles). */
function fitDepartments(nodes: MapNode[]): MapNode[] {
  return nodes.map((node) => {
    if (node.type !== "department") return node
    const children = nodes.filter((child) => child.parentId === node.id && !child.hidden)
    const { width, height } = departmentSize(children)
    const data = { ...(node.data as DepartmentData), empty: children.length === 0, count: children.length }
    return { ...node, data, style: { ...node.style, width, height } } as DepartmentNode
  })
}

function buildNodes(processes: Process[], departments: Department[], flows: ProductFlow[], showInactive: boolean): MapNode[] {
  const processNodes: ProcessNode[] = []
  const departmentNodes: DepartmentNode[] = []
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0

  departments.forEach((department, index) => {
    const color = COLORS[index % COLORS.length]
    const members = processes.filter((process) => process.departmentId === department.id)
    const children: ProcessNode[] = members.map((process, slot) => {
      const hasPosition = process.positionX !== null && process.positionY !== null
      return {
        id: `process-${process.id}`,
        type: "process",
        parentId: `department-${department.id}`,
        extent: "parent",
        hidden: process.status === "inactive" && !showInactive,
        // Unpositioned processes are placed in a 2-column grid inside their box
        position: hasPosition
          ? { x: process.positionX as number, y: process.positionY as number }
          : { x: PAD + (slot % 2) * (NODE_WIDTH + GAP), y: HEADER + PAD / 2 + Math.floor(slot / 2) * (NODE_HEIGHT + GAP) },
        data: {
          process,
          color,
          products: flows.filter((flow) => flow.processIds.includes(process.id)).map((flow) => ({ color: flow.color, label: `${flow.reference} ${flow.name}`, final: flow.finalProcessIds.includes(process.id) })),
        },
      }
    })
    const visible = children.filter((child) => !child.hidden)
    const { width, height } = departmentSize(visible)

    let position: { x: number; y: number }
    if (department.positionX !== null && department.positionY !== null) {
      position = { x: department.positionX, y: department.positionY }
    } else {
      // Unpositioned departments flow left to right, wrapping into rows
      if (cursorX > 0 && cursorX + width > 1500) {
        cursorX = 0
        cursorY += rowHeight + 60
        rowHeight = 0
      }
      position = { x: cursorX, y: cursorY }
      cursorX += width + 60
      rowHeight = Math.max(rowHeight, height)
    }

    departmentNodes.push({
      id: `department-${department.id}`,
      type: "department",
      position,
      draggable: true,
      zIndex: 0,
      style: { width, height },
      data: { name: department.name, count: visible.length, color, empty: visible.length === 0 },
    })
    processNodes.push(...children)
  })

  // React Flow requires parents before their children
  return [...departmentNodes, ...processNodes]
}

function FactoryMapCanvas({
  processes,
  departments,
  flows,
  onDirtyChange,
}: {
  processes: Process[]
  departments: Department[]
  flows: ProductFlow[]
  onDirtyChange: (dirty: boolean) => void
}) {
  const { toast } = useToast()
  const [showInactive, setShowInactive] = React.useState(false)
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(buildNodes(processes, departments, flows, false))
  const [hiddenProducts, setHiddenProducts] = React.useState<Set<number>>(new Set())
  const [, , onEdgesChange] = useEdgesState<Edge>([])
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const markDirty = (value: boolean) => {
    setDirty(value)
    onDirtyChange(value)
  }

  const toggleInactive = (checked: boolean) => {
    setShowInactive(checked)
    setNodes((current) =>
      fitDepartments(
        current.map((node) =>
          node.type === "process" ? { ...node, hidden: (node.data as ProcessData).process.status === "inactive" && !checked } : node
        ) as MapNode[]
      )
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveMapLayout({
        departments: nodes
          .filter((node) => node.type === "department")
          .map((node) => ({ id: Number(node.id.replace("department-", "")), position_x: Math.round(node.position.x), position_y: Math.round(node.position.y) })),
        processes: nodes
          .filter((node) => node.type === "process")
          .map((node) => ({ id: Number(node.id.replace("process-", "")), position_x: Math.round(node.position.x), position_y: Math.round(node.position.y) })),
      })
      markDirty(false)
      toast({ title: "Layout saved", description: "Department and process positions were stored." })
    } catch (error) {
      toast({ title: "Could not save layout", description: describeError(error), tone: "error" })
    } finally {
      setSaving(false)
    }
  }

  // One coloured arrow per product step that moves work from one process to another
  const edges = React.useMemo<Edge[]>(() => {
    const perPair = new Map<string, number>()
    return flows
      .filter((flow) => !hiddenProducts.has(flow.productId))
      .flatMap((flow) => {
        const seen = new Set<string>()
        return flow.edges.flatMap((edge) => {
          const key = `${flow.productId}:${edge.sourceProcessId}>${edge.targetProcessId}`
          if (seen.has(key)) return []
          seen.add(key)
          const pair = [edge.sourceProcessId, edge.targetProcessId].sort().join("-")
          const slot = perPair.get(pair) ?? 0
          perPair.set(pair, slot + 1) // parallel arrows between the same two processes are staggered
          return [
            {
              id: key,
              source: `process-${edge.sourceProcessId}`,
              target: `process-${edge.targetProcessId}`,
              type: "smoothstep",
              pathOptions: { offset: 24 + slot * 14, borderRadius: 8 },
              style: { stroke: flow.color, strokeWidth: 2.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: flow.color },
              ariaLabel: `${flow.reference}: ${edge.sourceProcessId} to ${edge.targetProcessId}`,
            } as Edge,
          ]
        })
      })
  }, [flows, hiddenProducts])

  const toggleProduct = (productId: number) =>
    setHiddenProducts((current) => {
      const next = new Set(current)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })

  const inactiveCount = processes.filter((process) => process.status === "inactive").length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(event) => toggleInactive(event.target.checked)} className="h-4 w-4 rounded border-border" />
          Show inactive processes (dimmed) {inactiveCount ? `(${inactiveCount})` : ""}
        </label>
        <div className="flex items-center gap-3">
          {dirty ? <span className="text-sm text-amber-500">Unsaved layout changes</span> : null}
          <Button onClick={save} disabled={!dirty || saving}>
            <Save className="size-4" />
            {saving ? "Saving..." : "Save layout"}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Package className="size-4" />
          Product flows
        </span>
        {flows.length === 0 ? <span className="text-sm text-muted-foreground">No product has a routing across processes yet.</span> : null}
        {flows.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Flag className="size-3.5" /> = a product&apos;s cycle ends at this process
          </span>
        ) : null}
        {flows.map((flow) => {
          const visible = !hiddenProducts.has(flow.productId)
          return (
            <button
              key={flow.productId}
              type="button"
              onClick={() => toggleProduct(flow.productId)}
              aria-pressed={visible}
              title={`${flow.name}: ${flow.edges.length} transfer(s) between processes`}
              className={`inline-flex items-center gap-2 border px-2.5 py-1 text-sm transition-opacity ${visible ? "" : "opacity-40"}`}
              style={{ borderColor: flow.color }}
            >
              <span className="size-3" style={{ backgroundColor: flow.color }} />
              {flow.reference}
            </button>
          )
        })}
        {flows.length > 1 ? (
          <Button variant="ghost" size="xs" onClick={() => setHiddenProducts(hiddenProducts.size ? new Set() : new Set(flows.map((flow) => flow.productId)))}>
            {hiddenProducts.size ? "Show all" : "Hide all"}
          </Button>
        ) : null}
      </div>
      <div className="h-[640px] border border-border/70 bg-card/60">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={() => {
            setNodes((current) => fitDepartments(current))
            markDirty(true)
          }}
          onInit={() => setNodes((current) => fitDepartments(current))}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      {departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no departments yet. Create one on the Departments page.</p>
      ) : null}
    </div>
  )
}

/**
 * The canvas is rebuilt whenever the underlying data changes. Data is re-read periodically and when the
 * tab regains focus, so edits made elsewhere show up without a manual reload. Refreshing pauses while
 * there are unsaved layout changes so they are never overwritten.
 */
export function FactoryMap({ processes, departments, flows }: { processes: Process[]; departments: Department[]; flows: ProductFlow[] }) {
  const router = useRouter()
  const [dirty, setDirty] = React.useState(false)

  const signature = React.useMemo(
    () =>
      JSON.stringify([
        departments.map((d) => [d.id, d.name, d.positionX, d.positionY]),
        processes.map((p) => [p.id, p.name, p.code, p.type, p.departmentId, p.status, p.quantity, p.capacity, p.positionX, p.positionY, p.rrtEnabled]),
        flows.map((f) => [f.productId, f.reference, f.color, f.edges.map((e) => [e.sourceProcessId, e.targetProcessId]), f.processIds, f.finalProcessIds]),
      ]),
    [processes, departments, flows]
  )

  React.useEffect(() => {
    if (dirty) return
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    const interval = window.setInterval(refresh, REFRESH_MS)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [dirty, router])

  return <FactoryMapCanvas key={signature} processes={processes} departments={departments} flows={flows} onDirtyChange={setDirty} />
}
