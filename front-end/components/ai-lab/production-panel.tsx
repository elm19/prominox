"use client"

import * as React from "react"
import { CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts"

import { runProductionEstimate, type AiProduct, type ProductionEstimate } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { fmtNumber } from "@/components/charts/sensor-visualization"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Explain, Field, Metric, Note, selectClass, tooltipStyle } from "@/components/ai-lab/shared"

const hours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${fmtNumber(h)} h` : `${fmtNumber(h / 24)} days`)

export function ProductionPanel({ products }: { products: AiProduct[] }) {
  const usable = products.filter((p) => p.run_count >= 5)
  const [productId, setProductId] = React.useState<number | "">(usable[0]?.id ?? "")
  const [quantity, setQuantity] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<ProductionEstimate | null>(null)

  if (usable.length === 0) {
    return <Note>No product has at least 5 recorded production runs yet. Record past runs on a product page to unlock estimates.</Note>
  }
  const product = usable.find((p) => p.id === productId)

  const run = async () => {
    const q = Number(quantity)
    if (productId === "" || !(q > 0)) {
      setError("Enter a quantity greater than zero.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      setResult(await runProductionEstimate({ product_id: productId, quantity: q }))
    } catch (e) {
      setResult(null)
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Estimate how long a batch will take and how much scrap to expect, learned from the product&apos;s past production runs.</p>
      <div className="grid gap-3 border border-border/70 bg-card/80 p-4 md:grid-cols-[1.5fr_1fr_auto] md:items-end">
        <Field label="Product">
          <select className={selectClass} value={productId} onChange={(e) => { setProductId(Number(e.target.value)); setResult(null) }}>
            {usable.map((p) => (
              <option key={p.id} value={p.id}>{p.reference} · {p.name} ({p.run_count} runs)</option>
            ))}
          </select>
        </Field>
        <Field label={`Good units to produce${product ? ` (${product.unit})` : ""}`}>
          <Input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 500" onKeyDown={(e) => e.key === "Enter" && run()} />
        </Field>
        <Button onClick={run} disabled={busy}>{busy ? "Estimating…" : "Estimate"}</Button>
      </div>

      {error ? <Note tone="error">{error}</Note> : null}

      {result?.ready && result.lead_time && result.scrap_pct ? (
        <div className="space-y-4 border border-border/70 bg-card/80 p-4">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
            <Metric label="Expected lead time" value={hours(result.lead_time.value)} hint={`likely ${hours(result.lead_time.low)} to ${hours(result.lead_time.high)}`} />
            <Metric label="Expected scrap" value={`${result.scrap_pct.value.toFixed(1)}%`} hint={`typically ${result.scrap_pct.low.toFixed(1)}% to ${result.scrap_pct.high.toFixed(1)}%`} />
            {result.hours_per_unit !== null && result.setup_hours !== null ? (
              <Metric label="Rule of thumb" value={`${fmtNumber(Math.max(result.setup_hours, 0))} h + ${fmtNumber(result.hours_per_unit * 60)} min / ${result.unit}`} hint="fixed time plus time per unit" />
            ) : null}
            <Metric label="Fit quality" value={`${Math.round((result.r2 ?? 0) * 100)}%`} hint={`of lead-time variation explained by batch size · ${result.runs_used} runs`} />
          </div>
          {result.note ? <Note>{result.note}</Note> : null}
          {(result.r2 ?? 0) < 0.3 && !result.note ? <Note tone="warn">Batch size explains little of the lead time for this product, so the range is wide. Other factors (operators, machines, queueing) matter more.</Note> : null}
          <div className="h-[clamp(260px,40vh,380px)] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 8, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.7} />
                <XAxis dataKey="quantity" type="number" domain={["auto", "auto"]} name="Quantity" unit={` ${result.unit}`} tickLine={false} axisLine={false} tickFormatter={fmtNumber} label={{ value: `Good units produced (${result.unit})`, position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <YAxis dataKey="lead_time_hours" type="number" width={56} name="Lead time" unit=" h" tickLine={false} axisLine={false} tickFormatter={fmtNumber} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} formatter={(v, n) => [fmtNumber(Number(v)), String(n)]} />
                <Scatter name="Past runs" data={result.runs} fill="#38bdf8" isAnimationActive={false} />
                <Line data={result.line} dataKey="lead_time_hours" stroke="#a78bfa" strokeWidth={2} dot={false} isAnimationActive={false} legendType="none" />
                <ReferenceDot x={result.quantity} y={result.lead_time.value} r={7} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">Blue dots: past runs · purple line: fitted trend · orange dot: your estimate</p>
        </div>
      ) : result ? (
        <Note>{result.note}</Note>
      ) : null}

      <Explain>
        <p>A straight line is fitted through the past runs: lead time against the number of good units. The slope is the time per unit and the intercept is the fixed time (setup, waiting). The range around the estimate is an 80% prediction interval, and it widens when the requested size is far from anything produced before.</p>
        <p>Scrap is the average scrap share of past runs, with its usual spread. More recorded runs make both estimates tighter.</p>
      </Explain>
    </div>
  )
}
