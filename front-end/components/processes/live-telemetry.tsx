"use client"

import * as React from "react"

import { getLiveUpdate } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { SensorExplorer } from "@/components/charts/sensor-visualization"
import { formatDateTime } from "@/lib/format"
import type { Process, SensorReading } from "@/lib/types"

const POLL_MS = 2000
const WINDOW = 500 // readings kept in memory per machine
const LIVE_WITHIN_S = 30
const DELAYED_WITHIN_S = 300

function merge(base: SensorReading[], incoming: SensorReading[]) {
  const byTime = new Map<string, SensorReading>()
  for (const reading of base) byTime.set(reading.timestamp, reading)
  for (const reading of incoming) byTime.set(reading.timestamp, { ...byTime.get(reading.timestamp), ...reading, values: { ...byTime.get(reading.timestamp)?.values, ...reading.values } })
  return [...byTime.values()].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp)).slice(-WINDOW)
}

function ago(seconds: number) {
  if (seconds < 5) return "just now"
  if (seconds < 60) return `${Math.round(seconds)} s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  return `${Math.round(seconds / 3600)} h ago`
}

/** Charts that follow a machine with RRT enabled: new readings are pulled every couple of seconds. */
export function LiveTelemetry({ process }: { process: Process }) {
  const [streamed, setStreamed] = React.useState<SensorReading[]>([])
  const [status, setStatus] = React.useState({ lastReceivedAt: process.rrtLastReceivedAt, lastError: null as string | null, lastErrorAt: null as string | null })
  const [paused, setPaused] = React.useState(false)
  const [unreachable, setUnreachable] = React.useState(false)
  const [now, setNow] = React.useState<number | null>(null)

  const readings = React.useMemo(() => merge(process.sensorData, streamed), [process.sensorData, streamed])
  const newest = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    newest.current = readings.at(-1)?.timestamp
  }, [readings])

  React.useEffect(() => {
    if (paused) return
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const update = await getLiveUpdate(process.id, newest.current)
        if (cancelled) return
        setUnreachable(false)
        setStatus({ lastReceivedAt: update.lastReceivedAt, lastError: update.lastError, lastErrorAt: update.lastErrorAt })
        if (update.readings.length) setStreamed((current) => merge(current, update.readings))
      } catch {
        if (!cancelled) setUnreachable(true)
      }
    }
    tick()
    const interval = window.setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [process.id, paused])

  // Clock used to age the "last data" label
  React.useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [])

  const age = status.lastReceivedAt && now !== null ? Math.max(0, (now - +new Date(status.lastReceivedAt)) / 1000) : null
  const state = unreachable
    ? { label: "API unreachable", dot: "bg-rose-500", text: "text-rose-500" }
    : age === null
      ? { label: "Waiting for data", dot: "bg-amber-500", text: "text-amber-500" }
      : age <= LIVE_WITHIN_S
        ? { label: "Live", dot: "bg-emerald-500 animate-pulse", text: "text-emerald-500" }
        : age <= DELAYED_WITHIN_S
          ? { label: "Delayed", dot: "bg-amber-500", text: "text-amber-500" }
          : { label: "No recent data", dot: "bg-rose-500", text: "text-rose-500" }
  const errorIsFresh = status.lastError && status.lastErrorAt && (!status.lastReceivedAt || +new Date(status.lastErrorAt) > +new Date(status.lastReceivedAt))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border/70 bg-card/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className={`inline-flex items-center gap-2 text-sm font-semibold ${paused ? "text-muted-foreground" : state.text}`}>
            <span className={`size-2.5 rounded-full ${paused ? "bg-muted-foreground" : state.dot}`} />
            {paused ? "Paused" : state.label}
          </span>
          <span className="text-sm text-muted-foreground">
            {status.lastReceivedAt && age !== null ? `Last data ${ago(age)} (${formatDateTime(status.lastReceivedAt)})` : "No data received from Node-RED yet"}
          </span>
        </div>
        <Button size="xs" variant="outline" onClick={() => setPaused((current) => !current)}>
          {paused ? "Resume live updates" : "Pause live updates"}
        </Button>
      </div>
      {errorIsFresh ? (
        <p className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <strong>The last request from Node-RED was rejected:</strong> {status.lastError}
        </p>
      ) : null}
      {readings.length === 0 ? (
        <p className="border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
          Waiting for the first reading. Configure Node-RED with the link in the Sensors & live tab.
        </p>
      ) : (
        <SensorExplorer sensors={process.sensors} readings={readings} />
      )}
    </div>
  )
}
