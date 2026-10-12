"use client"

import * as React from "react"

import { createRun, type ProcessOption, type RunInput } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { computeLevels } from "@/components/products/routing-flow"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import type { Product } from "@/lib/types"

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"

type StepRow = {
  include: boolean
  stepId: number
  name: string
  processId: number
  instance: string
  start: string
  end: string
  quantityIn: string
  quantityOut: string
  scrap: string
  operator: string
}

const toIso = (local: string) => new Date(local).toISOString()
const toLocal = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return shifted.toISOString().slice(0, 16)
}

export function RunForm({ product, processes, onDone }: { product: Product; processes: ProcessOption[]; onDone: () => void }) {
  const { toast } = useToast()
  const [mode, setMode] = React.useState<"manual" | "json">("manual")
  const [batch, setBatch] = React.useState("")
  const [order, setOrder] = React.useState("")
  const [start, setStart] = React.useState("")
  const [end, setEnd] = React.useState("")
  const [produced, setProduced] = React.useState("")
  const [scrap, setScrap] = React.useState("0")
  const [notes, setNotes] = React.useState("")
  const [json, setJson] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const ordered = React.useMemo(() => {
    const levels = computeLevels(product.steps)
    return [...product.steps].sort((a, b) => (levels.get(a.id) ?? 0) - (levels.get(b.id) ?? 0) || a.sequence - b.sequence)
  }, [product.steps])

  const [rows, setRows] = React.useState<StepRow[]>(() =>
    ordered.map((step) => ({
      include: true, stepId: step.id, name: step.name, processId: step.processId, instance: "",
      start: "", end: "", quantityIn: "", quantityOut: "", scrap: "0", operator: "",
    }))
  )

  const patchRow = (index: number, patch: Partial<StepRow>) =>
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))

  const spreadTimes = () => {
    if (!start || !end) return toast({ title: "Set the run's start and end first", tone: "error" })
    const included = rows.filter((row) => row.include)
    const span = (new Date(end).getTime() - new Date(start).getTime()) / Math.max(included.length, 1)
    let index = 0
    setRows((current) =>
      current.map((row) => {
        if (!row.include) return row
        const from = new Date(new Date(start).getTime() + span * index)
        const to = new Date(new Date(start).getTime() + span * (index + 1))
        index += 1
        return { ...row, start: toLocal(from), end: toLocal(to) }
      })
    )
  }

  const fillQuantities = () => {
    if (!produced.trim()) return toast({ title: "Enter the quantity produced first", tone: "error" })
    setRows((current) => current.map((row) => (row.include ? { ...row, quantityIn: produced, quantityOut: produced } : row)))
  }

  const submitManual = async () => {
    const number = (value: string, label: string) => {
      const parsed = Number(value)
      if (value.trim() === "" || !Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a number, 0 or more.`)
      return parsed
    }
    if (!batch.trim()) throw new Error("Batch number is required.")
    if (!start || !end) throw new Error("The run's start and end are required.")
    const included = rows.filter((row) => row.include)
    const payload: RunInput = {
      batch_number: batch.trim(),
      customer_order: order.trim() || null,
      started_at: toIso(start),
      ended_at: toIso(end),
      quantity_produced: number(produced, "Quantity produced"),
      quantity_scrap: number(scrap, "Scrap"),
      notes: notes.trim() || null,
      steps: included.map((row) => {
        if (!row.start || !row.end) throw new Error(`"${row.name}": start and end are required.`)
        return {
          product_step_id: row.stepId,
          process_id: row.processId,
          instance: row.instance.trim() ? Number(row.instance) : null,
          started_at: toIso(row.start),
          ended_at: toIso(row.end),
          quantity_in: number(row.quantityIn, `"${row.name}" quantity in`),
          quantity_out: number(row.quantityOut, `"${row.name}" quantity out`),
          quantity_scrap: number(row.scrap, `"${row.name}" scrap`),
          operator: row.operator.trim() || null,
        }
      }),
    }
    await createRun(product.id, payload)
    toast({ title: "Production run recorded", description: `Batch ${payload.batch_number}` })
  }

  const submitJson = async () => {
    const parsed = JSON.parse(json) as { runs?: RunInput[] }
    if (!Array.isArray(parsed.runs) || parsed.runs.length === 0) throw new Error("JSON must include a non-empty runs array.")
    const failures: string[] = []
    let saved = 0
    for (const [index, run] of parsed.runs.entries()) {
      try {
        await createRun(product.id, run)
        saved += 1
      } catch (error) {
        failures.push(`Run ${index + 1} (${run.batch_number ?? "?"}): ${describeError(error)}`)
      }
    }
    if (failures.length) throw new Error(`${saved} of ${parsed.runs.length} runs imported. ${failures.join(" | ")}`)
    toast({ title: "Production runs imported", description: `${saved} runs saved.` })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      if (mode === "json") await submitJson()
      else await submitManual()
      onDone()
    } catch (error) {
      toast({ title: "Could not record production", description: describeError(error), tone: "error" })
      if (mode === "json") onDone() // some runs may have been imported: refresh the list
    } finally {
      setBusy(false)
    }
  }

  const jsonExample = JSON.stringify(
    {
      runs: [
        {
          batch_number: "B-001",
          started_at: "2026-05-01T08:00:00Z",
          ended_at: "2026-05-01T16:00:00Z",
          quantity_produced: 98,
          quantity_scrap: 2,
          steps: ordered.slice(0, 2).map((step) => ({
            product_step_id: step.id,
            started_at: "2026-05-01T08:00:00Z",
            ended_at: "2026-05-01T12:00:00Z",
            quantity_in: 100,
            quantity_out: 99,
            quantity_scrap: 1,
          })),
        },
      ],
    },
    null,
    2
  )

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-border/70 bg-background/70 p-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={mode === "manual" ? "default" : "outline"} onClick={() => setMode("manual")}>
          Single run
        </Button>
        <Button type="button" size="sm" variant={mode === "json" ? "default" : "outline"} onClick={() => setMode("json")}>
          JSON import
        </Button>
      </div>

      {mode === "manual" ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="run-batch">Batch / lot number</Label>
              <Input id="run-batch" value={batch} onChange={(event) => setBatch(event.target.value)} placeholder="B-2026-014" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-order">Customer order (optional)</Label>
              <Input id="run-order" value={order} onChange={(event) => setOrder(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-notes">Notes (optional)</Label>
              <Input id="run-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-start">Started</Label>
              <Input id="run-start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-end">Finished</Label>
              <Input id="run-end" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="run-produced">Produced ({product.unit})</Label>
                <Input id="run-produced" type="number" min="0" step="any" value={produced} onChange={(event) => setProduced(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="run-scrap">Scrap</Label>
                <Input id="run-scrap" type="number" min="0" step="any" value={scrap} onChange={(event) => setScrap(event.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">How each step was executed</p>
                <p className="text-xs text-muted-foreground">Uncheck steps that were skipped. Every step must fall inside the run&apos;s dates.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="xs" variant="outline" onClick={spreadTimes}>
                  Spread times over the run
                </Button>
                <Button type="button" size="xs" variant="outline" onClick={fillQuantities}>
                  Fill quantities from produced
                </Button>
              </div>
            </div>
            {rows.length === 0 ? <p className="text-sm text-muted-foreground">This product has no routing steps yet. Add them above to record step executions.</p> : null}
            {rows.map((row, index) => (
              <div key={row.stepId} className={`grid gap-3 border border-border/70 p-3 md:grid-cols-6 ${row.include ? "" : "opacity-50"}`}>
                <label className="flex items-center gap-2 text-sm font-medium md:col-span-3">
                  <input type="checkbox" checked={row.include} onChange={(event) => patchRow(index, { include: event.target.checked })} className="size-4" />
                  {index + 1}. {row.name}
                </label>
                <select value={row.processId} onChange={(event) => patchRow(index, { processId: Number(event.target.value) })} className={`${selectClass} md:col-span-2`} aria-label="Process used" disabled={!row.include}>
                  {processes.map((process) => (
                    <option key={process.id} value={process.id}>
                      {process.name}
                    </option>
                  ))}
                </select>
                <Input type="number" min="1" placeholder="Instance #" value={row.instance} onChange={(event) => patchRow(index, { instance: event.target.value })} aria-label="Instance number" disabled={!row.include} />
                <Input type="datetime-local" value={row.start} onChange={(event) => patchRow(index, { start: event.target.value })} aria-label="Step start" disabled={!row.include} className="md:col-span-2" />
                <Input type="datetime-local" value={row.end} onChange={(event) => patchRow(index, { end: event.target.value })} aria-label="Step end" disabled={!row.include} className="md:col-span-2" />
                <Input type="number" min="0" step="any" placeholder="In" value={row.quantityIn} onChange={(event) => patchRow(index, { quantityIn: event.target.value })} aria-label="Quantity in" disabled={!row.include} />
                <Input type="number" min="0" step="any" placeholder="Out" value={row.quantityOut} onChange={(event) => patchRow(index, { quantityOut: event.target.value })} aria-label="Quantity out" disabled={!row.include} />
                <Input type="number" min="0" step="any" placeholder="Scrap" value={row.scrap} onChange={(event) => patchRow(index, { scrap: event.target.value })} aria-label="Scrap" disabled={!row.include} />
                <Input placeholder="Operator" value={row.operator} onChange={(event) => patchRow(index, { operator: event.target.value })} aria-label="Operator" disabled={!row.include} className="md:col-span-3" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <Input type="file" accept=".json,application/json" onChange={async (event) => setJson((await event.target.files?.[0]?.text()) ?? "")} aria-label="JSON file" />
          <Textarea value={json} onChange={(event) => setJson(event.target.value)} className="min-h-56 font-mono text-xs" placeholder={jsonExample} aria-label="JSON payload" />
          <div className="rounded-xl border border-dashed border-border/70 p-4">
            <p className="text-sm font-medium">Structure</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Same fields as the API. A step is either a routing step (product_step_id) or an extra operation (step_name + process_id). Invalid runs are rejected with every problem listed; valid runs in the same file are still imported.
            </p>
            <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">{jsonExample}</pre>
          </div>
        </div>
      )}

      <Button type="submit" disabled={busy}>
        {busy ? "Saving..." : mode === "json" ? "Import runs" : "Record production run"}
      </Button>
    </form>
  )
}
