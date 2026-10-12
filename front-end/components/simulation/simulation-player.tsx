"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts"

import type { SimResult } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Pause, Play, RotateCcw } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { ORDER_COLORS, fmtClock, fmtDuration } from "@/components/simulation/format"
import { SimulationFlow, type Snapshot } from "@/components/simulation/simulation-flow"

const SPEEDS = [0.25, 0.5, 1, 2, 5, 10]
const TARGET_SECONDS = 30 // at 1x the whole run lasts about this long

function countUpTo(sorted: number[], t: number) {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}


function snapshot(result: SimResult, processOf: (order: number, step: number) => number, t: number): Snapshot {
  const running = new Map<number, number[]>()
  const queued = new Map<number, number>()
  const transit = new Map<number, number>()
  const rows = result.trace
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (t >= r[7]) continue
    const pid = processOf(r[0], r[2])
    if (t >= r[6]) {
      const list = running.get(pid)
      if (list) list.push(i)
      else running.set(pid, [i])
    } else if (t >= r[5]) queued.set(pid, (queued.get(pid) ?? 0) + 1)
    else if (t >= r[4]) transit.set(pid, (transit.get(pid) ?? 0) + 1)
  }
  return { running, queued, transit }
}

function ProcessCard({ process, rows, result, queued, transit }: { process: SimResult["processes"][number]; rows: number[]; result: SimResult; queued: number; transit: number }) {
  const busy = rows.length
  const slots = process.slots
  const cells = slots !== null && slots <= 24 ? Array.from({ length: slots }, (_, i) => rows.find((index) => result.trace[index][3] === i)) : null
  const labels = new Map<string, number>()
  for (const index of rows) {
    const r = result.trace[index]
    const key = `${r[0]}|${result.orders[r[0]].steps[r[2]].name}`
    labels.set(key, (labels.get(key) ?? 0) + 1)
  }
  return (
    <div className={cn("space-y-2 border bg-card/80 p-3", busy ? "border-primary/50" : "border-border/70")}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold" title={process.name}>{process.name}</p>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{slots === null ? `${busy} working` : `${busy}/${slots}`}</span>
      </div>
      {cells ? (
        <div className="flex flex-wrap gap-1">
          {cells.map((index, i) => (
            <span
              key={i}
              className="size-4 border border-border/70"
              style={index === undefined ? undefined : { backgroundColor: ORDER_COLORS[result.trace[index][0] % ORDER_COLORS.length], borderColor: "transparent" }}
              title={index === undefined ? "idle" : `${result.orders[result.trace[index][0]].reference} #${result.trace[index][1] + 1}`}
            />
          ))}
        </div>
      ) : (
        <div className="h-2 bg-muted">
          <div className="h-full bg-primary" style={{ width: `${slots ? (busy / slots) * 100 : Math.min(busy * 4, 100)}%` }} />
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        <span className={queued ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>{queued} waiting</span>
        {transit ? <span className="text-sky-600 dark:text-sky-400">{transit} arriving</span> : null}
      </div>
      <ul className="min-h-[2.25rem] space-y-0.5 text-xs text-muted-foreground">
        {[...labels.entries()].slice(0, 3).map(([key, count]) => {
          const [order, step] = key.split("|")
          return (
            <li key={key} className="flex items-center gap-1.5 truncate">
              <span className="size-2 shrink-0" style={{ backgroundColor: ORDER_COLORS[Number(order) % ORDER_COLORS.length] }} />
              {step} ×{count}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function SimulationPlayer({ result }: { result: SimResult }) {
  const total = result.makespan_minutes ?? 0
  const [t, setT] = React.useState(0)
  const [playing, setPlaying] = React.useState(true)
  const [speed, setSpeed] = React.useState(1)
  const [look, setLook] = React.useState<"cards" | "flow">("cards")
  const base = total / TARGET_SECONDS // sim minutes per real second at 1x

  // Restart whenever a new run arrives
  const [seenSeed, setSeenSeed] = React.useState(result)
  if (seenSeed !== result) {
    setSeenSeed(result)
    setT(0)
    setPlaying(true)
  }

  React.useEffect(() => {
    if (!playing || total <= 0) return
    let frame = 0
    let last = performance.now()
    let lastPaint = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (now - lastPaint > 33) {
        lastPaint = now
        setT((current) => {
          const next = Math.min(total, current + dt * base * speed)
          if (next >= total) setPlaying(false)
          return next
        })
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, total, base])

  const processOf = React.useCallback((order: number, step: number) => result.orders[order].steps[step].process_id, [result])
  const snap = React.useMemo(() => snapshot(result, processOf, t), [result, processOf, t])

  const simulated = result.orders.filter((o) => o.simulated)
  const done = (index: number) => countUpTo(result.completions[index], t)
  const totalDone = simulated.reduce((sum, o) => sum + done(o.index), 0)
  const totalUnits = simulated.reduce((sum, o) => sum + o.quantity, 0)
  const wip = React.useMemo(() => {
    let count = 0
    const started = new Set<string>()
    for (const r of result.trace) if (t >= r[4] || t >= r[6]) started.add(`${r[0]}:${r[1]}`)
    count = started.size
    return count
  }, [result, t])

  const curve = React.useMemo(() => {
    const times = new Set<number>([0, total])
    const all = result.completions.flat().sort((a, b) => a - b)
    const stride = Math.max(1, Math.floor(all.length / 250))
    all.forEach((time, i) => i % stride === 0 && times.add(time))
    return [...times].sort((a, b) => a - b).map((time) => {
      const row: Record<string, number> = { t: time }
      simulated.forEach((o) => (row[`o${o.index}`] = countUpTo(result.completions[o.index], time)))
      return row
    })
  }, [result, simulated, total])

  const orderedProcesses = React.useMemo(() => {
    const first = new Map<number, number>()
    result.orders.forEach((o) => o.steps.forEach((s, i) => first.has(s.process_id) || first.set(s.process_id, i)))
    return [...result.processes].filter((p) => first.has(p.id)).sort((a, b) => (first.get(a.id) ?? 0) - (first.get(b.id) ?? 0))
  }, [result])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 border border-border/70 bg-card/80 p-3">
        <Button size="icon-sm" variant="outline" onClick={() => (t >= total ? (setT(0), setPlaying(true)) : setPlaying((p) => !p))} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button size="icon-sm" variant="outline" onClick={() => (setT(0), setPlaying(true))} aria-label="Restart">
          <RotateCcw className="size-4" />
        </Button>
        <div className="min-w-[8.5rem]">
          <p className="text-lg font-semibold tabular-nums">{fmtClock(t)}</p>
          <p className="text-xs text-muted-foreground">{fmtDuration(t)} elapsed</p>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(total, 1)}
          step={Math.max(total / 1000, 0.01)}
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          className="min-w-[160px] flex-1 accent-[var(--color-primary)]"
          aria-label="Simulation time"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="h-8 border border-input bg-background px-2 text-sm text-foreground">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
        </label>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">{totalDone}/{totalUnits}</p>
          <p className="text-xs text-muted-foreground">{wip - totalDone} in progress</p>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(simulated.length, 3)}, minmax(0, 1fr))` }}>
        {simulated.map((o) => {
          const count = done(o.index)
          return (
            <div key={o.index} className="space-y-2 border border-border/70 bg-card/80 p-3" style={{ borderTop: `3px solid ${ORDER_COLORS[o.index % ORDER_COLORS.length]}` }}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-semibold" title={o.name}>{o.reference}</p>
                <p className="text-sm tabular-nums"><strong className="text-xl">{count}</strong> / {o.quantity} {o.unit}</p>
              </div>
              <div className="h-2 bg-muted">
                <div className="h-full" style={{ width: `${(count / o.quantity) * 100}%`, backgroundColor: ORDER_COLORS[o.index % ORDER_COLORS.length] }} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Factory floor</p>
        <div className="inline-flex border border-border/70" role="group" aria-label="View">
          {([["cards", "Process cards"], ["flow", "Flow diagram"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setLook(id)}
              aria-pressed={look === id}
              className={cn("px-3 py-1.5 text-xs font-medium transition-colors", look === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {look === "flow" ? (
        <SimulationFlow result={result} snap={snap} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {orderedProcesses.map((process) => (
            <ProcessCard key={process.id} process={process} rows={snap.running.get(process.id) ?? []} result={result} queued={snap.queued.get(process.id) ?? 0} transit={snap.transit.get(process.id) ?? 0} />
          ))}
        </div>
      )}

      <div className="border border-border/70 bg-card/80 p-3">
        <p className="mb-2 text-sm font-medium">Units produced over time</p>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={curve} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.7} />
              <XAxis dataKey="t" type="number" domain={[0, total]} tickFormatter={(v) => fmtDuration(Number(v))} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis width={40} tickLine={false} axisLine={false} allowDecimals={false} />
              {simulated.map((o) => (
                <Line key={o.index} dataKey={`o${o.index}`} type="stepAfter" stroke={ORDER_COLORS[o.index % ORDER_COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
              <ReferenceLine x={t} stroke="var(--color-foreground)" strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
