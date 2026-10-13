"use client"

import * as React from "react"

import { createRun, type ProcessOption, type RunInput } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { computeLevels } from "@/components/products/routing-flow"
import { ArrowLeft, ArrowRight, Check } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
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
  // 0 = batch details, 1..n = one routing step each, n + 1 = review
  const [page, setPage] = React.useState(0)
  const [reached, setReached] = React.useState(0)

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

  const validatePage = (index: number) => {
    if (index === 0) {
      if (!batch.trim()) return "Batch number is required."
      if (!start || !end) return "The run's start and end are required."
      if (new Date(end) < new Date(start)) return "The run cannot finish before it starts."
      if (!produced.trim()) return "Enter the quantity produced."
      return null
    }
    const row = rows[index - 1]
    if (!row || !row.include) return null
    if (!row.start || !row.end) return `Fill in the start and end time of "${row.name}" before clicking Next.`
    if (new Date(row.end) < new Date(row.start)) return `"${row.name}" cannot end before it starts.`
    if (new Date(row.start) < new Date(start) || new Date(row.end) > new Date(end)) return `"${row.name}" must fall inside the run (${start.replace("T", " ")} → ${end.replace("T", " ")}).`
    return null
  }

  const goNext = () => {
    const problem = validatePage(page)
    if (problem) return toast({ title: "Not yet", description: problem, tone: "error" })
    const next = page + 1
    // Prefill the next step with what is most likely: it starts when the previous one ended
    const upcoming = rows[next - 1]
    if (upcoming && !upcoming.start) {
      const previous = rows.slice(0, next - 1).reverse().find((row) => row.include && row.end)
      patchRow(next - 1, {
        start: previous?.end ?? start,
        quantityIn: upcoming.quantityIn || (previous?.quantityOut ?? produced),
        quantityOut: upcoming.quantityOut || (previous?.quantityOut ?? produced),
      })
    }
    setPage(next)
    setReached((current) => Math.max(current, next))
  }

  const submitManual = async () => {
    const number = (value: string, label: string) => {
      const parsed = Number(value)
      if (value.trim() === "" || !Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a number, 0 or more.`)
      return parsed
    }
    for (let index = 0; index <= rows.length; index += 1) {
      const problem = validatePage(index)
      if (problem) {
        setPage(index)
        throw new Error(problem)
      }
    }
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
    if (mode === "manual" && page <= rows.length) return goNext()
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
          Step-by-step entry
        </Button>
        <Button type="button" size="sm" variant={mode === "json" ? "default" : "outline"} onClick={() => setMode("json")}>
          JSON import
        </Button>
      </div>

      {mode === "manual" ? (
        <>
          <div className="space-y-3">
            <Progress value={(page / (rows.length + 1)) * 100} />
            <div className="flex flex-wrap gap-1.5">
              {["Batch", ...rows.map((row) => row.name), "Review"].map((label, index) => (
                <button
                  key={index}
                  type="button"
                  disabled={index > reached}
                  onClick={() => setPage(index)}
                  className={`flex items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    index === page ? "border-primary bg-primary text-primary-foreground" : "border-border/70 hover:border-primary/50"
                  }`}
                >
                  {index < page && index > 0 && rows[index - 1]?.include ? <Check className="size-3" /> : null}
                  {index > 0 && index <= rows.length ? `${index}. ` : ""}
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-l-4 border-primary bg-primary/10 p-3 text-sm">
            {page === 0 ? (
              <>
                <strong>Step 1 of {rows.length + 2}:</strong> enter the batch details and the overall start and finish of the run, then click <strong>Next</strong>. The product will then go through all {rows.length} routing step(s), one at a time.
              </>
            ) : page <= rows.length ? (
              <>
                <strong>
                  Step {page + 1} of {rows.length + 2}:
                </strong>{" "}
                fill in the <strong>start and end time</strong> of &ldquo;{rows[page - 1].name}&rdquo;, then click <strong>Next</strong> to go to {page < rows.length ? `“${rows[page].name}”` : "the review"}.
              </>
            ) : (
              <>
                <strong>Last step:</strong> check every step below. Click a step name to go back and fix it, then save the run.
              </>
            )}
          </div>

          {page === 0 ? (
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
          ) : page <= rows.length ? (
            (() => {
              const index = page - 1
              const row = rows[index]
              return (
                <div className="space-y-4">
                  {rows.length === 0 ? null : (
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={!row.include} onChange={(event) => patchRow(index, { include: !event.target.checked })} className="size-4" />
                      This step was skipped for this batch
                    </label>
                  )}
                  <div className={`grid gap-4 md:grid-cols-6 ${row.include ? "" : "pointer-events-none opacity-40"}`}>
                    <div className="space-y-2 md:col-span-3">
                      <Label>Process used</Label>
                      <select value={row.processId} onChange={(event) => patchRow(index, { processId: Number(event.target.value) })} className={selectClass} aria-label="Process used">
                        {processes.map((process) => (
                          <option key={process.id} value={process.id}>
                            {process.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Instance #</Label>
                      <Input type="number" min="1" value={row.instance} onChange={(event) => patchRow(index, { instance: event.target.value })} aria-label="Instance number" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Operator</Label>
                      <Input value={row.operator} onChange={(event) => patchRow(index, { operator: event.target.value })} aria-label="Operator" />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <Label>Step start</Label>
                      <Input type="datetime-local" value={row.start} onChange={(event) => patchRow(index, { start: event.target.value })} aria-label="Step start" />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <Label>Step end</Label>
                      <Input type="datetime-local" value={row.end} onChange={(event) => patchRow(index, { end: event.target.value })} aria-label="Step end" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Quantity in</Label>
                      <Input type="number" min="0" step="any" value={row.quantityIn} onChange={(event) => patchRow(index, { quantityIn: event.target.value })} aria-label="Quantity in" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Quantity out</Label>
                      <Input type="number" min="0" step="any" value={row.quantityOut} onChange={(event) => patchRow(index, { quantityOut: event.target.value })} aria-label="Quantity out" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Scrap</Label>
                      <Input type="number" min="0" step="any" value={row.scrap} onChange={(event) => patchRow(index, { scrap: event.target.value })} aria-label="Scrap" />
                    </div>
                  </div>
                </div>
              )
            })()
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                <strong>{batch}</strong> · {start.replace("T", " ")} → {end.replace("T", " ")} · {produced} {product.unit} produced, {scrap} scrap
              </p>
              {rows.length === 0 ? <p className="text-sm text-muted-foreground">This product has no routing steps yet. Add them in the Routing tab to record step executions.</p> : null}
              {rows.map((row, index) => (
                <button key={row.stepId} type="button" onClick={() => setPage(index + 1)} className={`flex w-full flex-wrap items-center justify-between gap-2 border border-border/70 p-3 text-left text-sm hover:border-primary/50 ${row.include ? "" : "opacity-50"}`}>
                  <span className="font-medium">
                    {index + 1}. {row.name}
                  </span>
                  <span className="text-muted-foreground">{row.include ? `${row.start.replace("T", " ")} → ${row.end.replace("T", " ")} · ${row.quantityIn || 0} in / ${row.quantityOut || 0} out` : "skipped"}</span>
                </button>
              ))}
            </div>
          )}
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

      <div className="flex flex-wrap gap-2">
        {mode === "manual" && page > 0 ? (
          <Button type="button" variant="outline" onClick={() => setPage(page - 1)}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? (
            "Saving..."
          ) : mode === "json" ? (
            "Import runs"
          ) : page <= rows.length ? (
            <>
              Next
              <ArrowRight className="size-4" />
            </>
          ) : (
            "Record production run"
          )}
        </Button>
      </div>
    </form>
  )
}
