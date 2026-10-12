"use client"

import * as React from "react"
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { runAnomalies, type AiProcess, type AnomalyResult, type SensorAnomalies } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { fmtNumber, niceScale, niceTimeTicks } from "@/components/charts/sensor-visualization"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Explain, Field, Note, fmtDate, selectClass, tooltipStyle } from "@/components/ai-lab/shared"

const WINDOWS = [
  { label: "Last hour", hours: 1 },
  { label: "Last 6 hours", hours: 6 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 168 },
  { label: "Last 30 days", hours: 720 },
]
const SENSITIVITY = [
  { value: "low", label: "Low (only big deviations)" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High (flag small deviations)" },
] as const

function AnomalyChart({ sensor }: { sensor: SensorAnomalies }) {
  const data = React.useMemo(() => sensor.series.map((p) => ({ ...p, t: +new Date(p.t), alert: p.flagged ? p.value : null })), [sensor])
  const start = data[0].t
  const end = data.at(-1)!.t
  const values = data.flatMap((p) => [p.value])
  const scale = niceScale(Math.min(...values), Math.max(...values))
  const span = end - start
  const tick = (t: number) => new Date(t).toLocaleString("en-US", span > 2 * 86_400_000 ? { month: "short", day: "numeric" } : span > 6 * 3_600_000 ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" })
  return (
    <div className="h-[clamp(240px,38vh,360px)] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.7} />
          <XAxis dataKey="t" type="number" scale="time" domain={[start, end]} ticks={niceTimeTicks(start, end)} tickFormatter={tick} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis width={56} tickLine={false} axisLine={false} domain={scale.domain} ticks={scale.ticks} tickFormatter={fmtNumber} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label) => fmtDate(new Date(Number(label)).toISOString())}
            formatter={(value, name) => [fmtNumber(Number(value)), name === "expected" ? "Expected" : name === "alert" ? "Anomaly" : "Value"]}
          />
          <Line dataKey="expected" stroke="var(--color-muted-foreground)" strokeOpacity={0.6} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          <Line dataKey="value" stroke="#38bdf8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="alert" stroke="none" dot={{ r: 5, fill: "#f43f5e", stroke: "#fff", strokeWidth: 1 }} activeDot={{ r: 6 }} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AnomalyPanel({ processes }: { processes: AiProcess[] }) {
  const usable = processes.filter((p) => p.sensors.some((s) => s.reading_count >= 20))
  const [processId, setProcessId] = React.useState<number | "">(usable[0]?.id ?? "")
  const [hours, setHours] = React.useState(24)
  const [sensitivity, setSensitivity] = React.useState<"low" | "medium" | "high">("medium")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<AnomalyResult | null>(null)
  const [selected, setSelected] = React.useState<number | null>(null)

  if (usable.length === 0) return <Note>No process has enough sensor readings yet (at least 20 per sensor).</Note>

  const run = async () => {
    if (processId === "") return
    setBusy(true)
    setError(null)
    try {
      const data = await runAnomalies({ process_id: processId, window_hours: hours, sensitivity })
      setResult(data)
      const withChart = data.sensors.filter((s) => s.series.length)
      setSelected((withChart.sort((a, b) => b.anomaly_count - a.anomaly_count)[0] ?? data.sensors[0])?.sensor_id ?? null)
    } catch (e) {
      setResult(null)
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const current = result?.sensors.find((s) => s.sensor_id === selected)
  const total = result?.sensors.reduce((sum, s) => sum + s.anomaly_count, 0) ?? 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Find readings that do not fit the sensor&apos;s normal behaviour. No setup needed: it learns what normal looks like from the same window.</p>
      <div className="grid gap-3 border border-border/70 bg-card/80 p-4 md:grid-cols-3 xl:grid-cols-[1.4fr_1fr_1.2fr_auto] xl:items-end">
        <Field label="Process">
          <select className={selectClass} value={processId} onChange={(e) => setProcessId(Number(e.target.value))}>
            {usable.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Look at">
          <select className={selectClass} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {WINDOWS.map((w) => (
              <option key={w.hours} value={w.hours}>{w.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Sensitivity">
          <select className={selectClass} value={sensitivity} onChange={(e) => setSensitivity(e.target.value as typeof sensitivity)}>
            {SENSITIVITY.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Button onClick={run} disabled={busy}>{busy ? "Scanning…" : "Scan for anomalies"}</Button>
      </div>

      {error ? <Note tone="error">{error}</Note> : null}

      {result ? (
        <div className="space-y-4">
          <p className="text-sm">
            <strong>{total}</strong> unusual {total === 1 ? "reading" : "readings"} found across {result.sensors.length} {result.sensors.length === 1 ? "sensor" : "sensors"}
            {result.window_start && result.window_end ? <span className="text-muted-foreground"> · {fmtDate(result.window_start)} → {fmtDate(result.window_end)}</span> : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {result.sensors.map((s) => (
              <button
                key={s.sensor_id}
                type="button"
                onClick={() => setSelected(s.sensor_id)}
                className={cn("flex items-center gap-2 border px-3 py-1.5 text-sm transition-colors", s.sensor_id === selected ? "border-primary bg-primary/10" : "border-border/70 bg-card/60 hover:bg-muted")}
              >
                {s.name}
                <Badge variant={s.skipped_reason ? "outline" : s.anomaly_count ? "danger" : "success"}>{s.skipped_reason ? "skipped" : s.anomaly_count}</Badge>
              </button>
            ))}
          </div>

          {current ? (
            <div className="space-y-4 border border-border/70 bg-card/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{current.name}</h3>
                <Badge variant="outline">{current.data_type}</Badge>
                <span className="text-sm text-muted-foreground">{current.readings.toLocaleString()} readings scanned</span>
              </div>
              {current.skipped_reason ? <Note>{current.skipped_reason}.</Note> : null}
              {current.series.length ? (
                <>
                  <AnomalyChart sensor={current} />
                  <p className="text-xs text-muted-foreground">Blue: measured · dashed grey: what the model expected · red dots: anomalies</p>
                  {current.events.length ? (
                    <div className="max-h-72 overflow-auto border border-border/70">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-card text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">When</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                            <th className="px-3 py-2 font-medium">Expected</th>
                            <th className="px-3 py-2 font-medium">Strength</th>
                            <th className="px-3 py-2 font-medium">Readings</th>
                          </tr>
                        </thead>
                        <tbody>
                          {current.events.map((ev) => (
                            <tr key={ev.start} className="border-t border-border/50">
                              <td className="px-3 py-1.5">{fmtDate(ev.start)}</td>
                              <td className="px-3 py-1.5 font-medium tabular-nums">{fmtNumber(ev.peak_value)}</td>
                              <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{fmtNumber(ev.expected)}</td>
                              <td className="px-3 py-1.5 tabular-nums">{ev.score.toFixed(1)}×</td>
                              <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{ev.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Note>Nothing unusual in this window at this sensitivity.</Note>
                  )}
                </>
              ) : null}
              {current.rare_values.length ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Values seen in less than 2% of readings:</p>
                  <ul className="space-y-1 text-sm">
                    {current.rare_values.map((r) => (
                      <li key={r.value}>
                        <strong>{r.value}</strong> · {r.count} {r.count === 1 ? "time" : "times"} ({r.share_pct.toFixed(1)}%) · last at {fmtDate(r.last_seen)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {!current.skipped_reason && current.data_type !== "number" && !current.rare_values.length ? <Note>No rare values found.</Note> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <Explain>
        <p>For number sensors, each reading is compared with the rolling median of its neighbours. The gap is divided by how big gaps normally are for that sensor (a robust spread measure), giving a strength score. Readings above the threshold are flagged: 3.5× on high sensitivity, 4.5× on medium, 6× on low.</p>
        <p>Because it compares each point to its own surroundings, normal slow drifts and daily cycles are not flagged, only sudden jumps and spikes. True/false and text sensors are checked for values that almost never occur.</p>
      </Explain>
    </div>
  )
}
