"use client"

import * as React from "react"
import Link from "next/link"
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { Flag } from "@/lib/icons"
import { formatMinutes } from "@/lib/format"
import type { ProductStep } from "@/lib/types"

const NODE_WIDTH = 230
const COLUMN_GAP = 90
const ROW_GAP = 28
const NODE_HEIGHT = 112

type StepNodeData = { step: ProductStep; color: string; index: number }
type StepNode = Node<StepNodeData, "step">

function StepNodeView({ data }: NodeProps<StepNode>) {
  const { step, color, index } = data
  return (
    <div
      className="border bg-card p-3 shadow-sm"
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT, borderTop: `4px solid ${color}`, ...(step.isFinal ? { boxShadow: `0 0 0 2px ${color}` } : {}) }}
    >
      <Handle type="target" position={Position.Left} />
      <p className="truncate text-sm font-semibold">
        <span className="mr-1.5 text-muted-foreground">{index}.</span>
        {step.name}
      </p>
      <Link href={`/processes/${step.processId}`} className="nodrag mt-1 block truncate text-xs text-primary">
        {step.processName}
      </Link>
      <p className="mt-1 text-xs text-muted-foreground">
        {step.standardDurationMinutes !== null ? `${formatMinutes(step.standardDurationMinutes)} / unit` : "No standard time"}
      </p>
      {step.isFinal ? (
        <p className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white" style={{ backgroundColor: color }}>
          <Flag className="size-3" />
          End of cycle
        </p>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { step: StepNodeView }

/** Longest dependency chain to each step: its column in the diagram. */
export function computeLevels(steps: ProductStep[]) {
  const byId = new Map(steps.map((step) => [step.id, step]))
  const levels = new Map<number, number>()
  const level = (step: ProductStep, trail: Set<number> = new Set()): number => {
    const known = levels.get(step.id)
    if (known !== undefined) return known
    if (trail.has(step.id)) return 0 // defensive: the API rejects cycles
    trail.add(step.id)
    const parents = step.dependsOnStepIds.map((id) => byId.get(id)).filter((parent): parent is ProductStep => Boolean(parent))
    const value = parents.length ? 1 + Math.max(...parents.map((parent) => level(parent, trail))) : 0
    levels.set(step.id, value)
    return value
  }
  steps.forEach((step) => level(step))
  return levels
}

/** Read-only diagram of a product's routing: steps as nodes, dependencies as arrows. */
export function RoutingFlow({ steps, color }: { steps: ProductStep[]; color: string }) {
  const { nodes, edges, height } = React.useMemo(() => {
    const levels = computeLevels(steps)
    const rows = new Map<number, number>()
    const ordered = [...steps].sort((a, b) => a.sequence - b.sequence || a.id - b.id)
    const nodes: StepNode[] = ordered.map((step, index) => {
      const column = levels.get(step.id) ?? 0
      const row = rows.get(column) ?? 0
      rows.set(column, row + 1)
      return {
        id: String(step.id),
        type: "step",
        position: { x: column * (NODE_WIDTH + COLUMN_GAP), y: row * (NODE_HEIGHT + ROW_GAP) },
        draggable: false,
        data: { step, color, index: index + 1 },
      }
    })
    const edges: Edge[] = steps.flatMap((step) =>
      step.dependsOnStepIds.map((dependencyId) => ({
        id: `${dependencyId}-${step.id}`,
        source: String(dependencyId),
        target: String(step.id),
        type: "smoothstep",
        style: { stroke: color, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      }))
    )
    const tallest = Math.max(1, ...Array.from(rows.values()))
    return { nodes, edges, height: Math.max(220, tallest * (NODE_HEIGHT + ROW_GAP) + 80) }
  }, [steps, color])

  return (
    <div className="border border-border/70 bg-card/60" style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
