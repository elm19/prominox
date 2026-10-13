"use client"

import * as React from "react"

import { createRun } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { formatDateTime } from "@/lib/format"
import { computeLevels } from "@/components/products/routing-flow"
import { ArrowRight, Broadcast, Check } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/components/ui/toast"
import type { Product } from "@/lib/types"

type Session = {
  batch: string
  operator: string
  /** ISO timestamp at which each step was started; the next click ends it and starts the following one */
  marks: string[]
  /** ISO timestamp at which the last step ended, once the product is finished */
  finishedAt: string | null
}

const duration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function LiveRecorder({ product, onDone }: { product: Product; onDone: () => void }) {
  const { toast } = useToast()
  const storageKey = `prominox:live:${product.id}`
  // Resume an unfinished recording after a refresh (this component only mounts client-side, so reading storage here is safe)
  const [session, setSession] = React.useState<Session | null>(() => {
    try {
      const saved = window.localStorage.getItem(storageKey)
      return saved ? (JSON.parse(saved) as Session) : null
    } catch {
      return null
    }
  })
  const [batch, setBatch] = React.useState(() => `LIVE-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`)
  const [operator, setOperator] = React.useState("")
  const [scrapped, setScrapped] = React.useState(false)
  const [now, setNow] = React.useState(() => Date.now())
  const [busy, setBusy] = React.useState(false)

  const ordered = React.useMemo(() => {
    const levels = computeLevels(product.steps)
    return [...product.steps].sort((a, b) => (levels.get(a.id) ?? 0) - (levels.get(b.id) ?? 0) || a.sequence - b.sequence)
  }, [product.steps])

  const update = (next: Session | null) => {
    setSession(next)
    try {
      if (next) window.localStorage.setItem(storageKey, JSON.stringify(next))
      else window.localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }

  React.useEffect(() => {
    if (!session || session.finishedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [session])

  if (ordered.length === 0) {
    return <div className="border border-dashed border-border/70 p-4 text-sm text-muted-foreground">Add routing steps in the Routing tab first: live recording times each of them.</div>
  }

  const next = () => {
    if (!session) return
    const stamp = new Date().toISOString()
    if (session.marks.length < ordered.length) update({ ...session, marks: [...session.marks, stamp] })
    else update({ ...session, finishedAt: stamp })
  }

  const save = async () => {
    if (!session?.finishedAt) return
    setBusy(true)
    try {
      const mark = (index: number) => (index < session.marks.length - 1 ? session.marks[index + 1] : session.finishedAt!)
      await createRun(product.id, {
        batch_number: session.batch,
        started_at: session.marks[0],
        ended_at: session.finishedAt,
        quantity_produced: scrapped ? 0 : 1,
        quantity_scrap: scrapped ? 1 : 0,
        notes: "Recorded live",
        steps: ordered.map((step, index) => ({
          product_step_id: step.id,
          process_id: step.processId,
          started_at: session.marks[index],
          ended_at: mark(index),
          quantity_in: 1,
          quantity_out: scrapped && index === ordered.length - 1 ? 0 : 1,
          quantity_scrap: scrapped && index === ordered.length - 1 ? 1 : 0,
          operator: session.operator || null,
        })),
      })
      toast({ title: "Product recorded", description: `Batch ${session.batch}` })
      update(null)
      onDone()
    } catch (error) {
      toast({ title: "Could not save the recording", description: describeError(error), tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <div className="space-y-4 border border-primary/40 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Broadcast className="size-4 text-primary" />
          Live recording is on: you are producing one product right now.
        </div>
        <p className="text-sm text-muted-foreground">
          Start the recording, then click <strong>Next step</strong> each time the product moves on. The time of every step is measured for you. One product is recorded as a run of quantity 1.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="live-batch">Batch / serial number</Label>
            <Input id="live-batch" value={batch} onChange={(event) => setBatch(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="live-operator">Operator (optional)</Label>
            <Input id="live-operator" value={operator} onChange={(event) => setOperator(event.target.value)} />
          </div>
        </div>
        <Button
          onClick={() => {
            if (!batch.trim()) return toast({ title: "Enter a batch number first", tone: "error" })
            update({ batch: batch.trim(), operator: operator.trim(), marks: [new Date().toISOString()], finishedAt: null })
          }}
        >
          Start producing &ldquo;{ordered[0].name}&rdquo;
        </Button>
      </div>
    )
  }

  const current = session.marks.length - 1
  const done = session.finishedAt !== null
  const startOf = (index: number) => new Date(session.marks[index]).getTime()
  const endOf = (index: number) => (index < session.marks.length - 1 ? startOf(index + 1) : done ? new Date(session.finishedAt!).getTime() : now)
  const isLast = current === ordered.length - 1

  return (
    <div className="space-y-4 border border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={`size-2.5 rounded-full ${done ? "bg-emerald-500" : "animate-pulse bg-red-500"}`} />
          {done ? "Production finished" : "Recording"} · batch {session.batch}
        </div>
        <span className="text-xs text-muted-foreground">Started {formatDateTime(session.marks[0])}</span>
      </div>
      <Progress value={done ? 100 : (current / ordered.length) * 100} />

      <ol className="space-y-2">
        {ordered.map((step, index) => {
          const state = index < current || done ? "done" : index === current ? "active" : "todo"
          return (
            <li key={step.id} className={`flex items-center justify-between gap-3 border p-3 text-sm ${state === "active" ? "border-primary bg-background" : "border-border/70"} ${state === "todo" ? "opacity-50" : ""}`}>
              <span className="flex items-center gap-2 font-medium">
                {state === "done" ? <Check className="size-4 text-emerald-500" /> : <span className="w-4 text-center text-muted-foreground">{index + 1}</span>}
                {step.name}
                <span className="font-normal text-muted-foreground">({step.processName})</span>
              </span>
              <span className="tabular-nums">{state === "todo" ? "-" : duration(endOf(index) - startOf(index))}</span>
            </li>
          )
        })}
      </ol>

      {done ? (
        <div className="space-y-3">
          <p className="text-sm">
            Total time <strong className="tabular-nums">{duration(new Date(session.finishedAt!).getTime() - startOf(0))}</strong>. Save it to add this product to the production history.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={scrapped} onChange={(event) => setScrapped(event.target.checked)} className="size-4" />
            This product was scrapped
          </label>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving..." : "Save recording"}
            </Button>
            <Button variant="outline" onClick={() => update(null)} disabled={busy}>
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={next}>
            {isLast ? "Finish product" : <>Next step: {ordered[current + 1].name}<ArrowRight className="size-4" /></>}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (window.confirm("Discard this recording?")) update(null)
            }}
          >
            Cancel recording
          </Button>
          <span className="text-xs text-muted-foreground">Click when &ldquo;{ordered[current].name}&rdquo; is complete.</span>
        </div>
      )}
    </div>
  )
}
