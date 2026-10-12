"use client"

import * as React from "react"
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { runForecast, type AiProcess, type ForecastResult } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { fmtNumber, niceScale, niceTimeTicks } from "@/components/charts/sensor-visualization"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Explain, Field, Metric, Note, fmtDate, selectClass, tooltipStyle } from "@/components/ai-lab/shared"

const HISTORY = [
  { label: "Last hour", hours: 1 },
  { label: "Last 6 hours", hours: 6 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 168 },
  { label: "Last 30 days", hours: 720 },
]
const HORIZON = [
  { label: "5 minutes", minutes: 5 },
  { label: "15 minutes", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "6 hours", minutes: 360 },
  { label: "24 hours", minutes: 1440 },
  { label: "7 days", minutes: 10080 },
]
const MIN_READINGS = 30

const QUALITY = {
  good: { label: "Reliable", variant: "success" },
  fair: { label: "Rough", variant: "warning" },
  poor: { label: "Unreliable", variant: "danger" },
} as const

function ForecastChart({ result }: { result: ForecastResult }) {
  const data = React.useMemo(() => {
    const last = result.history.at(-1)!
    const rows: { t: number; history?: number; forecast?: number; band?: [number, number] }[] = result.history.map((p) => ({ t: +new Date(p.t), history: p.value }))
    rows.push({ t: +new Date(last.t), forecast: last.value, band: [last.value, last.value] })
    for (const p of result.forecast) rows.push({ t: +new Date(p.t), forecast: p.value, band: [p.lower, p.upper] })
    return rows
  }, [result])
  const start = data[0].t
  const end = data.at(-1)!.t
  const nowT = +new Date(result.history.at(-1)!.t)
  const all = data.flatMap((row) => [row.history, row.band?.[0], row.band?.[1]]).filter((v): v is number => typeof v === "number")
  const scale = niceScale(Math.min(...all), Math.max(...all))
  const span = end - start
  const tick = (t: number) => new Date(t).toLocaleString("en-US", span > 2 * 86_400_000 ? { month: "short", day: "numeric" } : span > 6 * 3_600_000 ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" })

  return (
    <div className="h-[clamp(280px,44vh,420px)] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.7} />
          <XAxis dataKey="t" type="number" scale="time" domain={[start, end]} ticks={niceTimeTicks(start, end)} tickFormatter={tick} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis width={56} tickLine={false} axisLine={false} domain={scale.domain} ticks={scale.ticks} tickFormatter={fmtNumber} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label) => fmtDate(new Date(Number(label)).toISOString())}
            formatter={(value, name) => (name === "band" ? [`${fmtNumber((value as number[])[0])} to ${fmtNumber((value as number[])[1])}`, "Likely range"] : [fmtNumber(Number(value)), name === "history" ? "Measured" : "Forecast"])}
          />
          <Area dataKey="band" stroke="none" fill="#a78bfa" fillOpacity={0.2} isAnimationActive={false} />
          <Line dataKey="history" stroke="#38bdf8" strokeWidth={1.75} dot={false} isAnimationActive={false} />
          <Line dataKey="forecast" stroke="#a78bfa" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <ReferenceLine x={nowT} stroke="var(--color-muted-foreground)" strokeDasharray="2 3" label={{ value: "last reading", position: "insideTopLeft", fontSize: 11, fill: "var(--color-muted-foreground)" }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ForecastPanel({ processes }: { processes: AiProcess[] }) {
  const usable = processes.filter((p) => p.sensors.some((s) => s.data_type === "number" && s.reading_count >= MIN_READINGS))
  const [processId, setProcessId] = React.useState<number | "">(usable[0]?.id ?? "")
  const process = usable.find((p) => p.id === processId)
  const sensors = process?.sensors.filter((s) => s.data_type === "number" && s.reading_count >= MIN_READINGS) ?? []
  const [sensorId, setSensorId] = React.useState<number | "">(sensors[0]?.id ?? "")
  const [hours, setHours] = React.useState(24)
  const [minutes, setMinutes] = React.useState(60)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<ForecastResult | null>(null)

  if (usable.length === 0) {
    return <Note>No number sensor has at least {MIN_READINGS} readings yet. Collect more data (or turn on live reception for a machine) and come back.</Note>
  }

  const run = async () => {
    if (sensorId === "" || processId === "") return
    setBusy(true)
    setError(null)
    try {
      setResult(await runForecast({ process_id: processId, sensor_id: sensorId, history_hours: hours, horizon_minutes: minutes }))
    } catch (e) {
      setResult(null)
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const quality = result ? QUALITY[result.quality] : null
  const stepLabel = result ? (result.step_seconds >= 60 ? `${Math.round(result.step_seconds / 60)} min` : `${result.step_seconds} s`) : ""

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Predict where a number sensor is heading, with a likely range. The model is chosen automatically by testing it on data it has not seen.</p>
      <div className="grid gap-3 border border-border/70 bg-card/80 p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end">
        <Field label="Process">
          <select
            className={selectClass}
            value={processId}
            onChange={(e) => {
              const id = Number(e.target.value)
              setProcessId(id)
              setSensorId(usable.find((p) => p.id === id)?.sensors.find((s) => s.data_type === "number" && s.reading_count >= MIN_READINGS)?.id ?? "")
            }}
          >
            {usable.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Sensor">
          <select className={selectClass} value={sensorId} onChange={(e) => setSensorId(Number(e.target.value))}>
            {sensors.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.reading_count.toLocaleString()} readings)</option>
            ))}
          </select>
        </Field>
        <Field label="Learn from">
          <select className={selectClass} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {HISTORY.map((h) => (
              <option key={h.hours} value={h.hours}>{h.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Predict the next">
          <select className={selectClass} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {HORIZON.map((h) => (
              <option key={h.minutes} value={h.minutes}>{h.label}</option>
            ))}
          </select>
        </Field>
        <Button onClick={run} disabled={busy || sensorId === ""}>{busy ? "Running…" : "Run forecast"}</Button>
      </div>

      {error ? <Note tone="error">{error}</Note> : null}

      {result && quality ? (
        <div className="space-y-4 border border-border/70 bg-card/80 p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <h3 className="text-base font-semibold">{result.sensor_name}</h3>
            <Badge variant={quality.variant}>{quality.label}</Badge>
            <Metric label="Model used" value={<span className="text-base">{result.model}</span>} />
            <Metric label="Typical error" value={fmtNumber(result.mae)} hint="average miss on unseen data" />
            <Metric label="vs. repeating last value" value={`${result.improvement_pct >= 0 ? "+" : ""}${result.improvement_pct.toFixed(0)}%`} hint="positive = more accurate" />
          </div>
          {result.quality === "poor" ? (
            <Note tone="warn">This sensor looks too random for any model here to beat &quot;it stays where it is&quot;. Treat the forecast as a guess.</Note>
          ) : null}
          <ForecastChart result={result} />
          <p className="text-xs text-muted-foreground">
            {result.readings_used.toLocaleString()} readings averaged into {stepLabel} steps · forecasting {result.horizon_steps} steps ahead · shaded band is the range the value should stay in about 80% of the time
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Compare tested models</summary>
            <table className="mt-2 w-full max-w-md text-left">
              <tbody>
                {result.candidates.map((c) => (
                  <tr key={c.name} className="border-b border-border/50 last:border-b-0">
                    <td className="py-1.5 pr-4">{c.name}{c.name === result.model ? " ✓" : ""}</td>
                    <td className="py-1.5 tabular-nums text-muted-foreground">{c.mae === null ? "n/a" : `error ${fmtNumber(c.mae)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      ) : null}

      <Explain>
        <p>The readings are averaged into regular time steps. Four small models are then tested: repeat the last value, continue the recent trend, and two autoregressive models that predict the next value from the last 2 or 6.</p>
        <p>Each is scored by hiding the most recent part of the data, forecasting it, and measuring the miss. The best scorer is refitted on everything and used for the forecast. The shaded range widens with distance because uncertainty grows.</p>
      </Explain>
    </div>
  )
}
