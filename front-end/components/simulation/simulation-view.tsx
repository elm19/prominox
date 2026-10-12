"use client"

import * as React from "react"

import { runSimulation, type SimCatalog, type SimResult, type SimStrategy } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Play, Plus, X } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { SimulationPlayer } from "@/components/simulation/simulation-player"
import { ORDER_COLORS, fmtDuration } from "@/components/simulation/format"

const selectClass = "h-9 w-full min-w-0 border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring"

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

const STRATEGY_NAMES: Record<SimStrategy, string> = {
  optimized: "Optimized (recommended)",
  fifo: "First come, first served",
  sequence: "One product after another",
  proportional: "Evenly mixed",
  spt: "Shortest operation first",
  lpt: "Longest operation first",
  remaining: "Most work remaining first",
}
const STRATEGY_HINTS: Record<SimStrategy, string> = {
  optimized: "Searches for the machine priorities that finish soonest",
  fifo: "Whoever arrives at a machine first goes first",
  sequence: "Finish the first product's work before the next",
  proportional: "Advance all products at the same relative pace",
  spt: "Quick jobs jump the queue",
  lpt: "Long jobs jump the queue",
  remaining: "Units with the longest path still ahead go first",
}

type OrderRow = { key: number; productId: number | ""; quantity: string }
type ProcessState = { enabled: boolean; instances: string }

export function SimulationView({ catalog }: { catalog: SimCatalog }) {
  const usable = catalog.products.filter((p) => p.step_count > 0 && p.status === "active")
  const nextKey = React.useRef(2)
  const [rows, setRows] = React.useState<OrderRow[]>([{ key: 1, productId: "", quantity: "" }])
  const [transfer, setTransfer] = React.useState("5")
  const [variability, setVariability] = React.useState("10")
  const [mode, setMode] = React.useState<"single" | "parallel">("single")
  const [seed, setSeed] = React.useState("")
  const [strategy, setStrategy] = React.useState<SimStrategy>("optimized")
  const [compare, setCompare] = React.useState(true)
  const [overrides, setOverrides] = React.useState<Record<number, Partial<ProcessState>>>({})
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<SimResult | null>(null)
  const [phase, setPhase] = React.useState<"setup" | "loading" | "result">("setup")
  const top = React.useRef<HTMLDivElement>(null)

  const productById = new Map(catalog.products.map((p) => [p.id, p]))
  const processById = new Map(catalog.processes.map((p) => [p.id, p]))
  const involved = [...new Set(rows.flatMap((r) => (r.productId === "" ? [] : productById.get(r.productId)?.process_ids ?? [])))]
    .map((id) => processById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
  const stateOf = (id: number): ProcessState => {
    const p = processById.get(id)!
    return { enabled: overrides[id]?.enabled ?? p.status === "active", instances: overrides[id]?.instances ?? String(p.quantity) }
  }
  const setOverride = (id: number, patch: Partial<ProcessState>) => setOverrides((current) => ({ ...current, [id]: { ...current[id], ...patch } }))

  const updateRow = (key: number, patch: Partial<OrderRow>) => setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const free = usable.filter((p) => !rows.some((r) => r.productId === p.id))

  const run = async (override?: { strategy: SimStrategy; seed?: number }) => {
    const orders = rows.filter((r) => r.productId !== "").map((r) => ({ product_id: r.productId as number, quantity: Math.floor(Number(r.quantity)) }))
    if (orders.length === 0 || orders.some((o) => !(o.quantity > 0))) {
      setError("Choose at least one product and give every quantity a whole number above zero.")
      return
    }
    setBusy(true)
    setError(null)
    setPhase("loading")
    top.current?.scrollIntoView({ block: "start" })
    try {
      const changed = involved.flatMap((p) => {
        const state = stateOf(p.id)
        const enabled = state.enabled !== (p.status === "active") ? state.enabled : undefined
        const instances = Number(state.instances) !== p.quantity ? Math.max(0, Math.floor(Number(state.instances)) || 0) : undefined
        return enabled === undefined && instances === undefined ? [] : [{ process_id: p.id, enabled, instances }]
      })
      // The loading screen stays up long enough to be noticed, even when the API answers instantly
      const [data] = await Promise.all([
        runSimulation({
          orders,
          transfer_minutes: Math.max(0, Number(transfer) || 0),
          variability_pct: Math.max(0, Number(variability) || 0),
          seed: override?.seed ?? (seed.trim() === "" ? undefined : Math.floor(Number(seed))),
          strategy: override?.strategy ?? strategy,
          compare,
          capacity_mode: mode,
          overrides: changed,
        }),
        new Promise((resolve) => window.setTimeout(resolve, 2200)),
      ])
      setResult(data)
      setPhase("result")
      top.current?.scrollIntoView({ block: "start" })
    } catch (e) {
      setError(describeError(e))
      setPhase("setup")
    } finally {
      setBusy(false)
    }
  }

  const blocked = result?.orders.filter((o) => !o.simulated) ?? []
  const bottleneck = result?.processes.find((p) => p.id === result.bottleneck_process_id)

  return (
    <div ref={top} className="scroll-mt-4 space-y-5">
      {phase === "setup" ? (
        <>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <section className="space-y-3 border border-border/70 bg-card/80 p-4">
          <h2 className="text-base font-semibold">What to produce</h2>
          {rows.map((row, index) => {
            const product = row.productId === "" ? null : productById.get(row.productId)
            return (
              <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_110px_auto] items-end gap-2" style={{ borderLeft: `4px solid ${ORDER_COLORS[index % ORDER_COLORS.length]}`, paddingLeft: 8 }}>
                <Field label="Product" hint={product ? `${product.step_count} steps · ${fmtDuration(product.minutes_per_unit)} for a single unit` : undefined}>
                  <select className={selectClass} value={row.productId} onChange={(e) => updateRow(row.key, { productId: Number(e.target.value) })}>
                    <option value="" disabled>Choose a product…</option>
                    {[...(product && !free.includes(product) ? [product] : []), ...free].map((p) => (
                      <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={`Units${product ? ` (${product.unit})` : ""}`}>
                  <Input type="number" min="1" value={row.quantity} placeholder="e.g. 50" onChange={(e) => updateRow(row.key, { quantity: e.target.value })} />
                </Field>
                <Button variant="ghost" size="icon-sm" onClick={() => setRows((c) => c.filter((r) => r.key !== row.key))} disabled={rows.length === 1} aria-label="Remove">
                  <X className="size-4" />
                </Button>
              </div>
            )
          })}
          <Button variant="outline" size="sm" disabled={free.length <= rows.filter((r) => r.productId === "").length || rows.length >= 10} onClick={() => setRows((c) => [...c, { key: nextKey.current++, productId: "", quantity: "" }])}>
            <Plus className="size-4" />
            Add product
          </Button>
        </section>

        <section className="space-y-3 border border-border/70 bg-card/80 p-4">
          <h2 className="text-base font-semibold">Parameters</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Movement time (min)" hint="Fixed, between steps on different processes">
              <Input type="number" min="0" value={transfer} onChange={(e) => setTransfer(e.target.value)} />
            </Field>
            <Field label="Time variation (±%)" hint="Random spread of each step's duration">
              <Input type="number" min="0" max="100" value={variability} onChange={(e) => setVariability(e.target.value)} />
            </Field>
            <Field label="Process capacity" hint={mode === "single" ? "Each instance handles one unit at a time" : "Each instance handles 'capacity' units at once"}>
              <select className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="single">One unit per instance</option>
                <option value="parallel">Capacity units at once</option>
              </select>
            </Field>
            <Field label="Scheduling strategy" hint={STRATEGY_HINTS[strategy]}>
              <select className={selectClass} value={strategy} onChange={(e) => setStrategy(e.target.value as SimStrategy)}>
                {(Object.keys(STRATEGY_HINTS) as SimStrategy[]).map((id) => (
                  <option key={id} value={id}>{STRATEGY_NAMES[id]}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 self-center text-sm">
              <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
              Compare all strategies
            </label>
            <Field label="Random seed" hint="Empty = new random run each time">
              <Input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random" />
            </Field>
          </div>
        </section>
      </div>

      <section className="space-y-3 border border-border/70 bg-card/80 p-4">
        <div>
          <h2 className="text-base font-semibold">Processes needed</h2>
          <p className="text-sm text-muted-foreground">Switch a process off to see what happens if it breaks down, or change how many instances run in parallel. Nothing is saved to the factory.</p>
        </div>
        {involved.length === 0 ? (
          <p className="text-sm text-muted-foreground">Choose a product to see its processes.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {involved.map((p) => {
              const state = stateOf(p.id)
              return (
                <div key={p.id} className={cn("flex items-center gap-3 border p-2.5", state.enabled ? "border-border/70" : "border-rose-500/50 bg-rose-500/5")}>
                  <input type="checkbox" checked={state.enabled} onChange={(e) => setOverride(p.id, { enabled: e.target.checked })} aria-label={`${p.name} on`} className="size-4 accent-[var(--color-primary)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={p.name}>{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.status === "inactive" ? <Badge variant="danger">off in factory</Badge> : "active"} · capacity {p.capacity === 0 ? "dynamic" : p.capacity}
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    ×
                    <Input type="number" min="0" className="h-8 w-16" value={state.instances} onChange={(e) => setOverride(p.id, { instances: e.target.value })} aria-label={`${p.name} instances`} />
                  </label>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => run()} disabled={busy || usable.length === 0}>
          <Play className="size-4" />
          Run simulation
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

        </>
      ) : null}

      {phase === "loading" ? <Loader orders={rows.filter((r) => r.productId !== "").length} searching={strategy === "optimized" || compare} /> : null}

      {phase === "result" && result ? (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-border/70 bg-card/80 p-3">
            <Button variant="outline" size="sm" onClick={() => setPhase("setup")}>
              ← Edit setup
            </Button>
            <Button size="sm" onClick={() => run()} disabled={busy}>
              <Play className="size-4" />
              Run again
            </Button>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
              Simulation started — {result.orders.map((o) => `${o.quantity} × ${o.reference}`).join(", ")}
            </span>
          </div>
        <div className="space-y-5">
          <div className={cn("border p-4", result.feasible ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/50 bg-amber-500/10")}>
            {result.feasible ? (
              <p className="text-sm">
                <strong>Possible.</strong> All orders can be produced with the current setup in about <strong>{fmtDuration(result.makespan_minutes ?? 0)}</strong>.
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                <p><strong>Not possible as configured.</strong> {blocked.length === result.orders.length ? "None of the orders can run." : "The orders below are blocked; the rest were simulated."}</p>
                <ul className="list-disc space-y-1 pl-5">
                  {blocked.map((o) => (
                    <li key={o.index}>
                      <strong>{o.reference}</strong> needs{" "}
                      {o.blockers.map((b) => `${b.process_name} (${b.reason === "off" ? "off" : b.reason}) for ${b.steps.join(", ")}`).join("; ")}
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground">Turn the process back on above, or add an instance, then run again.</p>
              </div>
            )}
          </div>

          {result.makespan_minutes !== null ? (
            <div className="grid grid-cols-2 gap-4 border border-border/70 bg-card/80 p-4 lg:grid-cols-4">
              <Stat label="This run" value={fmtDuration(result.makespan_minutes)} hint={`seed ${result.seed}`} />
              <Stat label="Without randomness" value={fmtDuration(result.monte_carlo?.expected ?? 0)} hint="ideal, no variation" />
              <Stat
                label="Typical range"
                value={result.monte_carlo && result.monte_carlo.runs > 1 ? `${fmtDuration(result.monte_carlo.p50)} – ${fmtDuration(result.monte_carlo.p90)}` : "n/a"}
                hint={result.monte_carlo && result.monte_carlo.runs > 1 ? `median to 90th percentile of ${result.monte_carlo.runs} runs` : "set a time variation above 0"}
              />
              <Stat label="Bottleneck" value={bottleneck?.name ?? "-"} hint={bottleneck?.utilization_pct != null ? `busy ${bottleneck.utilization_pct.toFixed(0)}% of the time` : undefined} />
            </div>
          ) : null}
          {result.metrics ? <QualityPanel result={result} onUse={(next) => run({ strategy: next, seed: result.seed })} busy={busy} /> : null}
          {result.warnings.map((w) => (
            <p key={w} className="border border-border/70 bg-muted/40 px-4 py-2 text-sm text-muted-foreground">{w}</p>
          ))}

          {result.makespan_minutes !== null ? <SimulationPlayer result={result} /> : null}

          {result.makespan_minutes !== null ? (
            <div className="overflow-x-auto border border-border/70 bg-card/80">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border/70">
                    <th className="px-3 py-2 font-medium">Process</th>
                    <th className="px-3 py-2 font-medium">Parallel slots</th>
                    <th className="px-3 py-2 font-medium">Operations</th>
                    <th className="px-3 py-2 font-medium">Busy</th>
                    <th className="px-3 py-2 font-medium">Average wait</th>
                  </tr>
                </thead>
                <tbody>
                  {result.processes.map((p) => (
                    <tr key={p.id} className={cn("border-b border-border/50 last:border-b-0", p.id === result.bottleneck_process_id && "bg-amber-500/10")}>
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2 tabular-nums">{p.slots ?? "unlimited"}</td>
                      <td className="px-3 py-2 tabular-nums">{p.tasks}</td>
                      <td className="px-3 py-2">
                        {p.utilization_pct === null ? (
                          <span className="text-muted-foreground">n/a</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(p.utilization_pct, 100)}%` }} /></div>
                            <span className="tabular-nums">{p.utilization_pct.toFixed(0)}%</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{fmtDuration(p.avg_wait_minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        </>
      ) : null}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 border-l-2 border-border pl-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="truncate text-lg font-semibold tabular-nums" title={value}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function Loader({ orders, searching }: { orders: number; searching: boolean }) {
  const stages = ["Checking that every process is available…", "Scheduling units through the routing…", ...(searching ? ["Searching for a better schedule…", "Comparing strategies…"] : []), "Running the simulation…"]
  const [stage, setStage] = React.useState(0)
  React.useEffect(() => {
    const id = window.setInterval(() => setStage((c) => Math.min(c + 1, stages.length - 1)), 700)
    return () => window.clearInterval(id)
  }, [stages.length])
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-6 border border-border/70 bg-card/80 p-8 text-center" role="status" aria-live="polite">
      <div className="relative h-10 w-72 max-w-full overflow-hidden border border-border/70 bg-muted/50">
        {[0, 1, 2].map((i) => (
          <span key={i} className="sim-slide absolute top-2 size-6 bg-primary" style={{ left: 0, animationDelay: `${i * 0.43}s`, opacity: 1 - i * 0.25 }} />
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold">Starting simulation</p>
        <p className="text-sm text-muted-foreground">{stages[stage]}</p>
        <p className="text-xs text-muted-foreground">{orders} {orders === 1 ? "order" : "orders"}</p>
      </div>
    </div>
  )
}

const METRIC_DEFS: { key: keyof NonNullable<SimResult["metrics"]>; label: string; help: string; format: (v: number) => string; better: "high" | "low" }[] = [
  { key: "makespan_minutes", label: "Total time", help: "From start until the last unit is finished", format: fmtDuration, better: "low" },
  { key: "efficiency_pct", label: "Efficiency", help: "Theoretical minimum time divided by actual time. 100% cannot be beaten.", format: (v) => `${v.toFixed(1)}%`, better: "high" },
  { key: "avg_utilization_pct", label: "Machine load", help: "Share of available machine time that was spent working (machines with limited slots)", format: (v) => `${v.toFixed(1)}%`, better: "high" },
  { key: "throughput_per_hour", label: "Output", help: "Units finished per hour over the whole run", format: (v) => `${v.toFixed(1)} /h`, better: "high" },
  { key: "avg_unit_completion_minutes", label: "Avg. unit done at", help: "Average time at which a unit is finished (lower means units are delivered sooner)", format: fmtDuration, better: "low" },
  { key: "avg_wait_minutes", label: "Avg. wait", help: "Average time a unit waits for a free machine before an operation", format: fmtDuration, better: "low" },
  { key: "max_wait_minutes", label: "Longest wait", help: "Worst single wait for a free machine", format: fmtDuration, better: "low" },
  { key: "avg_wip_units", label: "Units in progress", help: "Average number of units started but not finished", format: (v) => v.toFixed(1), better: "low" },
  { key: "bottleneck_utilization_pct", label: "Bottleneck load", help: "Load of the busiest machine", format: (v) => `${v.toFixed(0)}%`, better: "high" },
  { key: "utilization_spread_pct", label: "Load imbalance", help: "Gap between the busiest and the least busy machine", format: (v) => `${v.toFixed(0)} pts`, better: "low" },
]

function QualityPanel({ result, onUse, busy }: { result: SimResult; onUse: (s: SimStrategy) => void; busy: boolean }) {
  const m = result.metrics!
  const best = (key: keyof typeof m, better: "high" | "low") => {
    const values = result.comparison.map((row) => row.metrics[key])
    return values.length ? (better === "high" ? Math.max(...values) : Math.min(...values)) : null
  }
  const fastest = result.comparison.length ? Math.min(...result.comparison.map((r) => r.metrics.makespan_minutes)) : null
  return (
    <section className="space-y-4 border border-border/70 bg-card/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">How good was this run?</h2>
        <Badge variant="outline">Strategy: {result.strategy_label}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {METRIC_DEFS.map((def) => (
          <div key={def.key} className="min-w-0 border-l-2 border-border pl-3" title={def.help}>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{def.label}</p>
            <p className="truncate text-lg font-semibold tabular-nums">{def.format(m[def.key])}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        The fastest this order could ever be done with these machines is <strong className="text-foreground">{fmtDuration(m.lower_bound_minutes)}</strong>; this run took{" "}
        <strong className="text-foreground">{fmtDuration(m.makespan_minutes)}</strong> ({m.efficiency_pct.toFixed(1)}% of the way there).
        {m.efficiency_pct >= 95 ? " Scheduling cannot do much better: the busiest machine sets the pace, so the lever now is machine capacity." : ""}
      </p>

      {result.optimization ? (
        <div className="border border-border/70 bg-muted/40 px-4 py-3 text-sm">
          <strong>Schedule search:</strong> started from “{result.optimization.start_label}” ({fmtDuration(result.optimization.start_makespan)}), tried {result.optimization.iterations} alternatives in {result.optimization.seconds.toFixed(1)} s and{" "}
          {result.optimization.improvement_pct > 0.05 ? (
            <>found a plan <strong>{result.optimization.improvement_pct.toFixed(1)}% faster</strong> ({fmtDuration(result.optimization.best_makespan)}).</>
          ) : (
            <>found nothing faster: the best simple rule is already as good as it gets here. It still evens out waiting where it can.</>
          )}
        </div>
      ) : null}

      {result.advice.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {result.advice.map((a) => (
            <div key={a.process_id} className="border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
              <strong>Add one more {a.process_name}</strong> (now {a.instances}, busy {a.utilization_pct.toFixed(0)}% of the time): the same order would finish in about{" "}
              <strong>{fmtDuration(a.makespan_minutes)}</strong>, {a.saving_pct.toFixed(0)}% sooner.
            </div>
          ))}
        </div>
      ) : null}

      {result.comparison.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Strategy comparison</h3>
          <p className="text-xs text-muted-foreground">Same order, same machines, same random luck. Green marks the best value in each column. “Typical” is the median over repeated random runs.</p>
          <div className="overflow-x-auto border border-border/70">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/70">
                  <th className="px-3 py-2 font-medium">Strategy</th>
                  {METRIC_DEFS.filter((d) => ["makespan_minutes", "efficiency_pct", "avg_utilization_pct", "avg_wait_minutes", "avg_unit_completion_minutes", "avg_wip_units"].includes(d.key)).map((d) => (
                    <th key={d.key} className="px-3 py-2 font-medium" title={d.help}>{d.label}</th>
                  ))}
                  <th className="px-3 py-2 font-medium" title="Median total time over repeated random runs">Typical total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {result.comparison.map((row) => (
                  <tr key={row.strategy} className={cn("border-b border-border/50 last:border-b-0", row.selected && "bg-primary/5")}>
                    <td className="px-3 py-2 font-medium">
                      {row.label}
                      {row.selected ? <Badge variant="info" className="ml-2">used</Badge> : null}
                    </td>
                    {METRIC_DEFS.filter((d) => ["makespan_minutes", "efficiency_pct", "avg_utilization_pct", "avg_wait_minutes", "avg_unit_completion_minutes", "avg_wip_units"].includes(d.key)).map((d) => {
                      const isBest = Math.abs(row.metrics[d.key] - (best(d.key, d.better) ?? NaN)) < 1e-6
                      return (
                        <td key={d.key} className={cn("px-3 py-2 tabular-nums", isBest && "font-semibold text-emerald-600 dark:text-emerald-400")}>
                          {d.format(row.metrics[d.key])}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 tabular-nums">{row.typical_p50 !== null ? fmtDuration(row.typical_p50) : "-"}</td>
                    <td className="px-3 py-2 text-right">
                      {row.selected ? null : (
                        <Button size="xs" variant="outline" disabled={busy} onClick={() => onUse(row.strategy)}>
                          Run with this
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fastest !== null && result.comparison.filter((r) => Math.abs(r.metrics.makespan_minutes - fastest) < 0.01).length === result.comparison.length ? (
            <p className="text-xs text-muted-foreground">Every strategy finishes at the same time: the bottleneck machine decides the total, so the strategies only differ in waiting and units in progress.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
