"use client"

import * as React from "react"
import { Background, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import type { SimResult } from "@/lib/api"
import { cn } from "@/lib/utils"
import { ORDER_COLORS } from "@/components/simulation/format"

export type Snapshot = {
  running: Map<number, number[]>
  queued: Map<number, number>
  transit: Map<number, number>
}

type StationData = {
  name: string
  slots: number | null
  busy: number
  queued: number
  transit: number
  colors: string[] // product colours currently being worked on
  steps: string[]
}
type StationNode = Node<StationData, "station">

const WIDTH = 210
const COLUMN = 290
const ROW = 150

function StationView({ data }: NodeProps<StationNode>) {
  const active = data.busy > 0
  const color = data.colors[0] ?? "var(--color-border)"
  return (
    <div
      className={cn("border bg-card p-3", active && "sim-busy", !active && data.queued > 0 && "sim-waiting")}
      style={{ width: WIDTH, ["--blink" as string]: color, borderColor: active ? color : data.queued ? "#f59e0b" : undefined }}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <p className="truncate text-sm font-semibold" title={data.name}>{data.name}</p>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="tabular-nums text-muted-foreground">{data.slots === null ? `${data.busy} working` : `${data.busy}/${data.slots} busy`}</span>
        {data.queued ? <span className="font-medium text-amber-600 dark:text-amber-400">{data.queued} waiting</span> : null}
      </div>
      <div className="mt-2 flex h-2 overflow-hidden bg-muted">
        {data.colors.map((c, i) => (
          <div key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
        ))}
      </div>
      <p className="mt-1.5 min-h-4 truncate text-[11px] text-muted-foreground">{data.steps.join(" · ") || (data.transit ? `${data.transit} arriving` : "idle")}</p>
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  )
}

const nodeTypes = { station: StationView }

/** Column of each process: the longest chain of hand-overs leading to it. */
function layout(result: SimResult) {
  const edges = new Map<string, number>() // "a>b" -> first order index
  const ids = new Set<number>()
  for (const order of result.orders) {
    order.steps.forEach((step) => {
      ids.add(step.process_id)
      for (const from of step.after) {
        const source = order.steps[from].process_id
        if (source !== step.process_id) edges.set(`${source}>${step.process_id}`, edges.get(`${source}>${step.process_id}`) ?? order.index)
      }
    })
  }
  const level = new Map<number, number>([...ids].map((id) => [id, 0]))
  for (let pass = 0; pass < ids.size; pass++) {
    for (const key of edges.keys()) {
      const [a, b] = key.split(">").map(Number)
      level.set(b, Math.max(level.get(b) ?? 0, (level.get(a) ?? 0) + 1))
    }
    // a cycle between products' routings would never settle; stop growing past the node count
    for (const [id, value] of level) level.set(id, Math.min(value, ids.size))
  }
  return { edges, level }
}

export function SimulationFlow({ result, snap }: { result: SimResult; snap: Snapshot }) {
  const { edges: edgeMap, level } = React.useMemo(() => layout(result), [result])
  const positions = React.useMemo(() => {
    const rows = new Map<number, number>()
    const out = new Map<number, { x: number; y: number }>()
    for (const process of [...result.processes].filter((p) => level.has(p.id)).sort((a, b) => (level.get(a.id) ?? 0) - (level.get(b.id) ?? 0))) {
      const col = level.get(process.id) ?? 0
      const row = rows.get(col) ?? 0
      rows.set(col, row + 1)
      out.set(process.id, { x: col * COLUMN, y: row * ROW })
    }
    return out
  }, [result, level])

  const nodes: StationNode[] = result.processes
    .filter((p) => positions.has(p.id))
    .map((p) => {
      const rows = snap.running.get(p.id) ?? []
      const colors = [...new Set(rows.map((i) => result.trace[i][0]))].map((o) => ORDER_COLORS[o % ORDER_COLORS.length])
      const stepNames = [...new Set(rows.map((i) => result.orders[result.trace[i][0]].steps[result.trace[i][2]].name))].slice(0, 2)
      return {
        id: String(p.id),
        type: "station",
        position: positions.get(p.id)!,
        draggable: false,
        data: { name: p.name, slots: p.slots, busy: rows.length, queued: snap.queued.get(p.id) ?? 0, transit: snap.transit.get(p.id) ?? 0, colors, steps: stepNames },
      }
    })
  const edges: Edge[] = [...edgeMap.entries()].map(([key, order]) => {
    const [a, b] = key.split(">")
    const flowing = (snap.transit.get(Number(b)) ?? 0) > 0
    const color = ORDER_COLORS[order % ORDER_COLORS.length]
    return {
      id: key,
      source: a,
      target: b,
      animated: flowing,
      markerEnd: { type: MarkerType.ArrowClosed, color: flowing ? color : undefined },
      style: { stroke: flowing ? color : "var(--color-border)", strokeWidth: flowing ? 2.5 : 1.5 },
    }
  })

  return (
    <div className="h-[clamp(360px,60vh,640px)] w-full border border-border/70 bg-card/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
      >
        <Background gap={20} />
      </ReactFlow>
    </div>
  )
}
