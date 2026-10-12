"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { createStep, deleteStep, updateStep, type ProcessOption } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { formatMinutes } from "@/lib/format"
import { Flag, Plus } from "@/lib/icons"
import { EmptyState } from "@/components/dashboard/empty-state"
import { computeLevels, RoutingFlow } from "@/components/products/routing-flow"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import type { Product, ProductStep } from "@/lib/types"

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"

type Draft = { name: string; processId: number; duration: string; description: string; dependsOn: number[] }

function StepForm({
  draft,
  setDraft,
  processes,
  otherSteps,
  onSubmit,
  onCancel,
  busy,
  submitLabel,
}: {
  draft: Draft
  setDraft: (draft: Draft) => void
  processes: ProcessOption[]
  otherSteps: ProductStep[]
  onSubmit: (event: React.FormEvent) => void
  onCancel: () => void
  busy: boolean
  submitLabel: string
}) {
  const toggle = (id: number) =>
    setDraft({ ...draft, dependsOn: draft.dependsOn.includes(id) ? draft.dependsOn.filter((item) => item !== id) : [...draft.dependsOn, id] })

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-xl border border-border/70 bg-background/70 p-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="step-name">Step name</Label>
        <Input id="step-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Seam welding" required maxLength={150} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="step-process">Process</Label>
        <select id="step-process" value={draft.processId} onChange={(event) => setDraft({ ...draft, processId: Number(event.target.value) })} className={selectClass}>
          {processes.map((process) => (
            <option key={process.id} value={process.id}>
              {process.name}
              {process.code ? ` (${process.code})` : ""}
              {process.status === "inactive" ? " - inactive" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="step-duration">Standard time per unit (minutes, optional)</Label>
        <Input id="step-duration" type="number" min="0" step="any" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Starts after</Label>
        {otherSteps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other step yet: this is a first step.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {otherSteps.map((step) => (
              <label key={step.id} className={`inline-flex cursor-pointer items-center gap-2 border px-2.5 py-1 text-sm ${draft.dependsOn.includes(step.id) ? "border-primary bg-primary/10" : "border-border"}`}>
                <input type="checkbox" checked={draft.dependsOn.includes(step.id)} onChange={() => toggle(step.id)} className="size-3.5" />
                {step.name}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Select several for steps that join parallel branches; none for a first step.</p>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="step-description">Work instructions (optional)</Label>
        <Textarea id="step-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      </div>
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" disabled={busy || !draft.name.trim() || !draft.processId}>
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function StepManager({ product, processes }: { product: Product; processes: ProcessOption[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [mode, setMode] = React.useState<"idle" | "add" | number>("idle")
  const [busy, setBusy] = React.useState(false)

  const levels = React.useMemo(() => computeLevels(product.steps), [product.steps])
  const ordered = React.useMemo(
    () => [...product.steps].sort((a, b) => (levels.get(a.id) ?? 0) - (levels.get(b.id) ?? 0) || a.sequence - b.sequence),
    [product.steps, levels]
  )
  const lastStep = ordered[ordered.length - 1]

  const emptyDraft = (): Draft => ({
    name: "",
    processId: processes[0]?.id ?? 0,
    duration: "",
    description: "",
    // New steps follow the last step by default: the common linear case needs no extra clicks
    dependsOn: lastStep ? [lastStep.id] : [],
  })
  const [draft, setDraft] = React.useState<Draft>(emptyDraft)

  const startAdd = () => {
    setDraft(emptyDraft())
    setMode("add")
  }
  const startEdit = (step: ProductStep) => {
    setDraft({
      name: step.name,
      processId: step.processId,
      duration: step.standardDurationMinutes !== null ? String(step.standardDurationMinutes) : "",
      description: step.description ?? "",
      dependsOn: step.dependsOnStepIds,
    })
    setMode(step.id)
  }

  const payload = () => ({
    name: draft.name.trim(),
    process_id: draft.processId,
    description: draft.description.trim() || null,
    standard_duration_minutes: draft.duration.trim() ? Number(draft.duration) : null,
    depends_on_step_ids: draft.dependsOn,
  })

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true)
    try {
      await action()
      setMode("idle")
      router.refresh()
    } catch (error) {
      toast({ title: failure, description: describeError(error), tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  const submitAdd = (event: React.FormEvent) => {
    event.preventDefault()
    return run(async () => {
      await createStep(product.id, payload())
      toast({ title: "Step added", description: draft.name.trim() })
    }, "Could not add step")
  }

  const submitEdit = (event: React.FormEvent) => {
    event.preventDefault()
    return run(async () => {
      await updateStep(product.id, mode as number, payload())
      toast({ title: "Step updated", description: draft.name.trim() })
    }, "Could not update step")
  }

  const remove = (step: ProductStep) => {
    if (!window.confirm(`Delete the step "${step.name}"? Past production records keep its name.`)) return
    return run(async () => {
      await deleteStep(product.id, step.id)
      toast({ title: "Step deleted", description: step.name })
    }, "Could not delete step")
  }

  const nameOf = (id: number) => product.steps.find((step) => step.id === id)?.name ?? `#${id}`

  return (
    <div className="space-y-4">
      {product.steps.length > 0 ? <RoutingFlow steps={product.steps} color={product.color} /> : null}

      <Card className="bg-card/80">
        <CardHeader className="gap-3 md:flex md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Routing steps</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">The processes this product passes through, and which step must finish before another starts.</p>
          </div>
          <Button onClick={() => (mode === "add" ? setMode("idle") : startAdd())} variant={mode === "add" ? "outline" : "default"} disabled={processes.length === 0}>
            <Plus className="size-4" />
            {mode === "add" ? "Cancel" : "Add step"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "add" ? (
            <StepForm draft={draft} setDraft={setDraft} processes={processes} otherSteps={ordered} onSubmit={submitAdd} onCancel={() => setMode("idle")} busy={busy} submitLabel="Add step" />
          ) : null}

          {ordered.length === 0 ? (
            <EmptyState title="No routing yet" description={processes.length ? "Add the first step to start modelling how this product flows through the factory." : "Create processes first, then add steps."} />
          ) : (
            <ol className="space-y-3">
              {ordered.map((step, index) =>
                mode === step.id ? (
                  <li key={step.id}>
                    <StepForm
                      draft={draft}
                      setDraft={setDraft}
                      processes={processes}
                      otherSteps={ordered.filter((other) => other.id !== step.id)}
                      onSubmit={submitEdit}
                      onCancel={() => setMode("idle")}
                      busy={busy}
                      submitLabel="Save step"
                    />
                  </li>
                ) : (
                  <li key={step.id} className="flex flex-col gap-3 border border-border/70 bg-background/70 p-4 md:flex-row md:items-start md:justify-between" style={{ borderLeft: `4px solid ${product.color}` }}>
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span>
                          <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                          {step.name}
                        </span>
                        {step.isFinal ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white" style={{ backgroundColor: product.color }}>
                            <Flag className="size-3" />
                            End of cycle
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        On <span className="text-foreground">{step.processName}</span>
                        {step.standardDurationMinutes !== null ? ` · ${formatMinutes(step.standardDurationMinutes)} per ${product.unit}` : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {step.dependsOnStepIds.length ? `After: ${step.dependsOnStepIds.map(nameOf).join(", ")}` : "First step"}
                      </p>
                      {step.description ? <p className="whitespace-pre-line text-sm text-muted-foreground">{step.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="xs" variant="outline" onClick={() => startEdit(step)} disabled={busy}>
                        Edit
                      </Button>
                      <Button size="xs" variant="destructive" onClick={() => remove(step)} disabled={busy}>
                        Delete
                      </Button>
                    </div>
                  </li>
                )
              )}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
