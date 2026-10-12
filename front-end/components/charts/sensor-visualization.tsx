"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SensorDefinition, SensorReading } from "@/lib/types"

const PALETTE = ["#f59e0b", "#38bdf8", "#34d399", "#a78bfa", "#f97316", "#14b8a6", "#fb7185", "#facc15"]
const MAX_POINTS = 1200 // points actually drawn; larger windows are bucketed
const MIN_SPAN = 5_000

type Point = { t: number; value: number | string | boolean }
type View = { mode: "preset"; span: number | null } | { mode: "custom"; start: number; end: number }

const HOUR = 3_600_000
const PRESETS: { label: string; span: number | null }[] = [
  { label: "15m", span: 15 * 60_000 },
  { label: "1h", span: HOUR },
  { label: "6h", span: 6 * HOUR },
  { label: "24h", span: 24 * HOUR },
  { label: "7d", span: 7 * 24 * HOUR },
  { label: "All", span: null },
]

function getPoints(sensor: SensorDefinition, readings: SensorReading[]): Point[] {
  return readings
    .flatMap((reading) => {
      const value = reading.values[sensor.key]
      return value === undefined || value === null ? [] : [{ t: +new Date(reading.timestamp), value }]
    })
    .sort((a, b) => a.t - b.t)
}

export const fmtNumber = (value: number) => (Number.isInteger(value) ? String(value) : Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2))
const fmtFull = (t: number) => new Date(t).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" })

function makeTickFormatter(span: number) {
  const options: Intl.DateTimeFormatOptions =
    span > 2 * 24 * HOUR
      ? { month: "short", day: "numeric" }
      : span > 12 * HOUR
        ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
        : span > 10 * 60_000
          ? { hour: "2-digit", minute: "2-digit" }
          : { hour: "2-digit", minute: "2-digit", second: "2-digit" }
  return (t: number) => new Date(t).toLocaleString("en-US", options)
}

/** Keeps the min and max of every bucket so spikes survive when a long window is drawn. */
function downsample(points: Point[]): Point[] {
  if (points.length <= MAX_POINTS) return points
  const size = Math.ceil(points.length / (MAX_POINTS / 2))
  const out: Point[] = []
  for (let i = 0; i < points.length; i += size) {
    const bucket = points.slice(i, i + size)
    let lo = bucket[0]
    let hi = bucket[0]
    for (const point of bucket) {
      if ((point.value as number) < (lo.value as number)) lo = point
      if ((point.value as number) > (hi.value as number)) hi = point
    }
    out.push(...(lo.t <= hi.t ? [lo, hi] : [hi, lo]))
  }
  return out
}


/** Round tick steps (1, 2, 5 x 10^n) so the value axis lands on readable numbers. */
export function niceScale(min: number, max: number, target = 5): { domain: [number, number]; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { domain: [0, 1], ticks: [0, 1] }
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1
    min -= pad
    max += pad
  }
  const pad = (max - min) * 0.08
  const raw = (max - min + 2 * pad) / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((candidate) => candidate >= raw) ?? raw
  const lo = Math.floor((min - pad) / step) * step
  const hi = Math.ceil((max + pad) / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)))
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks }
}

const TIME_STEPS = [1, 2, 5, 10, 15, 30].map((n) => n * 1000).concat([1, 2, 5, 10, 15, 30].map((n) => n * 60_000), [1, 3, 6, 12].map((n) => n * HOUR), [1, 2, 7, 14, 30].map((n) => n * 24 * HOUR))

/** Ticks on round clock times (e.g. :00, :15, :30) instead of arbitrary offsets, so they do not jitter while data streams in. */
export function niceTimeTicks(start: number, end: number, target = 6): number[] {
  const step = TIME_STEPS.find((candidate) => (end - start) / candidate <= target) ?? TIME_STEPS[TIME_STEPS.length - 1]
  const offset = step >= 24 * HOUR ? -new Date(start).getTimezoneOffset() * 60_000 : 0
  const ticks: number[] = []
  for (let t = Math.ceil((start + offset) / step) * step - offset; t <= end; t += step) ticks.push(t)
  return ticks
}

const tooltipStyle = { borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-card)", fontSize: 12 }

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}

/** Window state shared by every chart: presets that follow the newest reading, drag-to-zoom, wheel zoom and panning. */
function useWindow(points: Point[]) {
  const [view, setView] = React.useState<View>({ mode: "preset", span: 6 * HOUR })
  const first = points[0]?.t ?? 0
  const last = points.at(-1)?.t ?? 0
  const dataSpan = Math.max(last - first, MIN_SPAN)

  const [start, end] = React.useMemo(() => {
    if (view.mode === "custom") return [view.start, view.end]
    if (view.span === null) return [first, Math.max(last, first + MIN_SPAN)]
    return [last - view.span, last]
  }, [view, first, last])

  const set = React.useCallback(
    (nextStart: number, nextEnd: number) => {
      const span = Math.max(MIN_SPAN, nextEnd - nextStart)
      const s = Math.min(Math.max(nextStart, first - span * 0.05), Math.max(last - span * 0.95, first))
      setView({ mode: "custom", start: s, end: s + span })
    },
    [first, last]
  )
  const zoom = (factor: number, anchor = 0.5) => {
    const span = end - start
    const next = Math.min(Math.max(span * factor, MIN_SPAN), dataSpan * 1.05)
    const point = start + span * anchor
    set(point - next * anchor, point + next * (1 - anchor))
  }
  const pan = (fraction: number) => set(start + (end - start) * fraction, end + (end - start) * fraction)
  const visible = React.useMemo(() => {
    const margin = (end - start) * 0.02
    return points.filter((point) => point.t >= start - margin && point.t <= end + margin)
  }, [points, start, end])

  return { view, setView, start, end, set, zoom, pan, visible, first, last, dataSpan }
}
type WindowState = ReturnType<typeof useWindow>

function Toolbar({ w, color, children }: { w: WindowState; color: string; children?: React.ReactNode }) {
  const atLatest = w.view.mode === "preset"
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex border border-border/70" role="group" aria-label="Time range">
        {PRESETS.map((preset) => {
          const active = w.view.mode === "preset" && w.view.span === preset.span
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => w.setView({ mode: "preset", span: preset.span })}
              className={cn("px-2.5 py-1 text-xs font-medium transition-colors", active ? "text-white" : "text-muted-foreground hover:bg-muted")}
              style={active ? { backgroundColor: color } : undefined}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      <div className="inline-flex gap-1">
        <Button size="icon-xs" variant="outline" onClick={() => w.pan(-0.4)} aria-label="Earlier" title="Earlier">
          ‹
        </Button>
        <Button size="icon-xs" variant="outline" onClick={() => w.pan(0.4)} aria-label="Later" title="Later">
          ›
        </Button>
        <Button size="icon-xs" variant="outline" onClick={() => w.zoom(0.5)} aria-label="Zoom in" title="Zoom in">
          +
        </Button>
        <Button size="icon-xs" variant="outline" onClick={() => w.zoom(2)} aria-label="Zoom out" title="Zoom out">
          −
        </Button>
      </div>
      {!atLatest ? (
        <Button size="xs" variant="ghost" onClick={() => w.setView({ mode: "preset", span: w.end - w.start })}>
          Jump to latest
        </Button>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1">{children}</div>
    </div>
  )
}

/** Small overview of the whole history: shows the visible window and moves it on click or drag. */
function Minimap({ points, w, color, children }: { points: Point[]; w: WindowState; color: string; children?: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef(false)
  const total = Math.max(w.last - w.first, MIN_SPAN)
  const move = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const center = w.first + Math.min(Math.max((clientX - box.left) / box.width, 0), 1) * total
    const half = (w.end - w.start) / 2
    w.set(center - half, center + half)
  }
  const left = Math.max(0, ((w.start - w.first) / total) * 100)
  const right = Math.min(100, ((w.end - w.first) / total) * 100)
  return (
    <div
      ref={ref}
      className="relative h-9 cursor-ew-resize touch-none select-none border border-border/70 bg-background/60"
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        move(event.clientX)
      }}
      onPointerMove={(event) => dragging.current && move(event.clientX)}
      onPointerUp={() => (dragging.current = false)}
      aria-label="History overview"
    >
      <div className="pointer-events-none absolute inset-0">{children}</div>
      <div
        className="pointer-events-none absolute inset-y-0 border-x-2"
        style={{ left: `${left}%`, width: `${Math.max(right - left, 0.8)}%`, borderColor: color, backgroundColor: `${color}22` }}
      />
      <span className="sr-only">{points.length} readings</span>
    </div>
  )
}

/** Wires drag-to-zoom and wheel zoom/pan onto a chart wrapper. */
function useChartGestures(w: WindowState) {
  const [drag, setDrag] = React.useState<{ from: number; to: number } | null>(null)
  const box = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const element = box.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) w.pan(((event.deltaX || event.deltaY) / rect.width) * 1.2)
      else w.zoom(event.deltaY > 0 ? 1.25 : 0.8, Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1))
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  })

  const handlers = {
    onMouseDown: (state: { activeLabel?: string | number } | null) => typeof state?.activeLabel === "number" && setDrag({ from: state.activeLabel, to: state.activeLabel }),
    onMouseMove: (state: { activeLabel?: string | number } | null) =>
      drag && typeof state?.activeLabel === "number" && setDrag({ ...drag, to: state.activeLabel }),
    onMouseUp: () => {
      if (drag && Math.abs(drag.to - drag.from) > MIN_SPAN / 2) w.set(Math.min(drag.from, drag.to), Math.max(drag.from, drag.to))
      setDrag(null)
    },
  }
  return { box, drag, handlers }
}

const xAxisProps = (w: WindowState) => ({
  dataKey: "t",
  type: "number" as const,
  scale: "time" as const,
  domain: [w.start, w.end] as [number, number],
  allowDataOverflow: true,
  ticks: niceTimeTicks(w.start, w.end),
  tickFormatter: makeTickFormatter(w.end - w.start),
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
})

function NumberView({ points, color }: { points: Point[]; color: string }) {
  const w = useWindow(points)
  const { box, drag, handlers } = useChartGestures(w)
  const shown = React.useMemo(() => downsample(w.visible) as { t: number; value: number }[], [w.visible])
  const overview = React.useMemo(() => downsample(points) as { t: number; value: number }[], [points])
  const values = w.visible.map((point) => point.value as number)
  const hasValues = values.length > 0
  const min = hasValues ? Math.min(...values) : 0
  const max = hasValues ? Math.max(...values) : 1
  const avg = hasValues ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  const scale = React.useMemo(() => niceScale(min, max), [min, max])

  return (
    <div className="space-y-3">
      <Toolbar w={w} color={color}>
        <Stat label="Latest" value={fmtNumber(points.at(-1)!.value as number)} />
        <Stat label="Min" value={hasValues ? fmtNumber(min) : "-"} />
        <Stat label="Max" value={hasValues ? fmtNumber(max) : "-"} />
        <Stat label="Avg" value={hasValues ? fmtNumber(avg) : "-"} />
      </Toolbar>
      <div ref={box} className="h-[clamp(260px,42vh,420px)] w-full select-none">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={shown} margin={{ top: 8, right: 20, left: 0, bottom: 4 }} {...handlers}>
            <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.7} />
            <XAxis {...xAxisProps(w)} />
            <YAxis tickLine={false} axisLine={false} width={56} domain={scale.domain} ticks={scale.ticks} allowDataOverflow tickFormatter={fmtNumber} />
            <Tooltip cursor={{ stroke: color, strokeOpacity: 0.5 }} contentStyle={tooltipStyle} labelFormatter={(label) => fmtFull(Number(label))} formatter={(value) => [fmtNumber(Number(value)), "Value"]} />
            <Line type="linear" dataKey="value" stroke={color} strokeWidth={1.75} dot={shown.length < 60 ? { r: 2.5, strokeWidth: 0, fill: color } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
            {drag ? <ReferenceArea x1={drag.from} x2={drag.to} fill={color} fillOpacity={0.15} stroke={color} /> : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Minimap points={points} w={w} color={color}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={overview} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
            <XAxis dataKey="t" type="number" scale="time" domain={[w.first, Math.max(w.last, w.first + MIN_SPAN)]} hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Line type="linear" dataKey="value" stroke={color} strokeWidth={1} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Minimap>
      <p className="text-xs text-muted-foreground">
        {w.visible.length.toLocaleString()} of {points.length.toLocaleString()} readings in view · drag to zoom, scroll to zoom, shift+scroll to pan
      </p>
    </div>
  )
}

function BooleanView({ points, color }: { points: Point[]; color: string }) {
  const w = useWindow(points)
  const { box, drag, handlers } = useChartGestures(w)
  const data = React.useMemo(() => w.visible.map((point) => ({ t: point.t, value: point.value ? 1 : 0 })), [w.visible])
  const trueShare = data.length ? (data.filter((point) => point.value === 1).length / data.length) * 100 : 0
  return (
    <div className="space-y-3">
      <Toolbar w={w} color={color}>
        <Stat label="Current" value={points.at(-1)!.value === true ? "True" : "False"} />
        <Stat label="True" value={`${trueShare.toFixed(0)}%`} />
        <Stat label="False" value={`${(100 - trueShare).toFixed(0)}%`} />
      </Toolbar>
      <div ref={box} className="h-[clamp(160px,28vh,240px)] w-full select-none">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }} {...handlers}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="4 4" vertical={false} />
            <XAxis {...xAxisProps(w)} />
            <YAxis ticks={[0, 1]} domain={[0, 1]} tickFormatter={(value) => (value === 1 ? "True" : "False")} tickLine={false} axisLine={false} width={56} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => fmtFull(Number(label))} formatter={(value) => [value === 1 ? "True" : "False", "Value"]} />
            <Area type="stepAfter" dataKey="value" stroke={color} fill={color} fillOpacity={0.25} strokeWidth={2} isAnimationActive={false} />
            {drag ? <ReferenceArea x1={drag.from} x2={drag.to} fill={color} fillOpacity={0.15} stroke={color} /> : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <Minimap points={points} w={w} color={color} />
    </div>
  )
}

function TextView({ points, color }: { points: Point[]; color: string }) {
  const w = useWindow(points)
  const segments = React.useMemo(() => {
    const out: { value: string; start: number; count: number }[] = []
    for (const point of w.visible) {
      const value = String(point.value)
      const last = out.at(-1)
      if (last && last.value === value) last.count += 1
      else out.push({ value, start: point.t, count: 1 })
    }
    return out
  }, [w.visible])
  const distinct = Array.from(new Set(segments.map((segment) => segment.value)))
  const tone = (value: string) => `hsl(${(distinct.indexOf(value) * 360) / Math.max(distinct.length, 1)} 65% 55%)`
  const total = w.visible.length
  return (
    <div className="space-y-3">
      <Toolbar w={w} color={color}>
        <Stat label="Current" value={String(points.at(-1)!.value)} />
        <Stat label="Distinct" value={String(distinct.length)} />
        <Stat label="Changes" value={String(Math.max(segments.length - 1, 0))} />
      </Toolbar>
      <div className="flex h-10 w-full overflow-hidden border border-border/70" role="img" aria-label="Timeline of text values">
        {segments.map((segment, index) => (
          <div key={index} title={`${segment.value} (from ${fmtFull(segment.start)})`} style={{ width: `${(segment.count / Math.max(total, 1)) * 100}%`, backgroundColor: tone(segment.value) }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {distinct.map((value) => {
          const count = w.visible.filter((point) => String(point.value) === value).length
          return (
            <span key={value} className="inline-flex items-center gap-2 text-sm">
              <span className="size-3" style={{ backgroundColor: tone(value) }} />
              {value}
              <span className="text-muted-foreground">
                {count} ({((count / Math.max(total, 1)) * 100).toFixed(0)}%)
              </span>
            </span>
          )
        })}
      </div>
      <Minimap points={points} w={w} color={color} />
      <div className="max-h-48 overflow-y-auto border border-border/70">
        <table className="w-full text-left text-sm">
          <tbody>
            {[...segments].reverse().slice(0, 30).map((segment, index) => (
              <tr key={index} className="border-b border-border/50 last:border-b-0">
                <td className="px-3 py-1.5 font-medium">{segment.value}</td>
                <td className="px-3 py-1.5 text-muted-foreground">since {fmtFull(segment.start)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SensorChart({ sensor, points, color }: { sensor: SensorDefinition; points: Point[]; color: string }) {
  if (points.length === 0) {
    return <p className="border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">No readings recorded for this sensor yet.</p>
  }
  // key resets zoom when switching sensors
  if (sensor.dataType === "number") return <NumberView key={sensor.id} points={points} color={color} />
  if (sensor.dataType === "boolean") return <BooleanView key={sensor.id} points={points} color={color} />
  return <TextView key={sensor.id} points={points} color={color} />
}

function latestLabel(sensor: SensorDefinition, points: Point[]) {
  const value = points.at(-1)?.value
  if (value === undefined) return "-"
  if (sensor.dataType === "number") return fmtNumber(value as number)
  if (sensor.dataType === "boolean") return value ? "True" : "False"
  return String(value)
}

/** One sensor at a time: pick it from the list, then explore its history. */
export function SensorExplorer({ sensors, readings }: { sensors: SensorDefinition[]; readings: SensorReading[] }) {
  const [selectedId, setSelectedId] = React.useState<number | null>(sensors[0]?.id ?? null)
  const pointsBySensor = React.useMemo(() => new Map(sensors.map((sensor) => [sensor.id, getPoints(sensor, readings)])), [sensors, readings])

  const selectedIndex = Math.max(
    sensors.findIndex((sensor) => sensor.id === selectedId),
    0
  )
  const sensor = sensors[selectedIndex]
  if (!sensor) return null
  const color = PALETTE[selectedIndex % PALETTE.length]

  return (
    <div className="border border-border/70 bg-card/80 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="size-3 shrink-0" style={{ backgroundColor: color }} />
        <select
          value={sensor.id}
          onChange={(event) => setSelectedId(Number(event.target.value))}
          aria-label="Sensor"
          className="h-9 min-w-[220px] max-w-full border border-input bg-background px-2.5 text-sm font-medium outline-none focus-visible:border-ring"
        >
          {sensors.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {latestLabel(item, pointsBySensor.get(item.id) ?? [])}
            </option>
          ))}
        </select>
        <Badge variant="outline">{sensor.dataType}</Badge>
        {sensor.description ? <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={sensor.description}>{sensor.description}</p> : null}
      </div>
      <SensorChart sensor={sensor} points={pointsBySensor.get(sensor.id) ?? []} color={color} />
    </div>
  )
}
