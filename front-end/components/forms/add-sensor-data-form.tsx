"use client"

import * as React from "react"

import { describeError } from "@/lib/errors"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Process, ReadingValue, SensorDefinition, SensorReading } from "@/lib/types"

function nowLocal() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

const exampleValue = (sensor: SensorDefinition): ReadingValue =>
  sensor.dataType === "number" ? 12.5 : sensor.dataType === "boolean" ? true : "value"

export function AddSensorDataForm({
  process,
  onSubmit,
  onBulkSubmit,
}: {
  process: Process
  onSubmit: (reading: SensorReading) => Promise<void>
  onBulkSubmit: (readings: SensorReading[]) => Promise<void>
}) {
  const { toast } = useToast()
  const [mode, setMode] = React.useState<"manual" | "json">("manual")
  const [timestamp, setTimestamp] = React.useState(nowLocal)
  // Raw text per sensor id; converted according to the sensor's data type on submit
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [jsonPayload, setJsonPayload] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const sensorJsonExample = React.useMemo(
    () =>
      JSON.stringify(
        {
          entries: [
            {
              timestamp: "2026-05-06T08:00:00Z",
              values: Object.fromEntries(process.sensors.map((sensor) => [sensor.key, exampleValue(sensor)])),
            },
          ],
        },
        null,
        2
      ),
    [process.sensors]
  )

  const readJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setJsonPayload(await file.text())
  }

  const run = async (action: () => Promise<void>, success: { title: string; description: string }, failure: string) => {
    setIsSubmitting(true)
    try {
      await action()
      toast(success)
    } catch (error) {
      toast({ title: failure, description: describeError(error), tone: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (mode === "json") {
      await run(
        async () => {
          const parsed = JSON.parse(jsonPayload) as { entries?: Array<{ timestamp: string; values: Record<string, ReadingValue> }> }
          if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
            throw new Error("JSON must include a non-empty entries array.")
          }
          const readings = parsed.entries.map((entry, index) => {
            const date = new Date(entry.timestamp)
            if (!entry.timestamp || Number.isNaN(+date)) throw new Error(`Entry ${index + 1}: invalid or missing timestamp.`)
            if (!entry.values || typeof entry.values !== "object") throw new Error(`Entry ${index + 1}: values must be an object keyed by sensor id.`)
            return { timestamp: date.toISOString(), values: entry.values }
          })
          await onBulkSubmit(readings)
          setJsonPayload("")
        },
        { title: "Sensor batch imported", description: `Readings were saved for ${process.name}.` },
        "Could not import sensor JSON"
      )
      return
    }

    await run(
      async () => {
        const converted: Record<string, ReadingValue> = {}
        for (const sensor of process.sensors) {
          const raw = values[sensor.key]?.trim() ?? ""
          if (raw === "") continue
          if (sensor.dataType === "number") {
            const number = Number(raw)
            if (!Number.isFinite(number)) throw new Error(`${sensor.name}: "${raw}" is not a number.`)
            converted[sensor.key] = number
          } else if (sensor.dataType === "boolean") {
            converted[sensor.key] = raw === "true"
          } else {
            converted[sensor.key] = values[sensor.key]
          }
        }
        if (Object.keys(converted).length === 0) throw new Error("Enter a value for at least one sensor.")
        await onSubmit({ timestamp: new Date(timestamp).toISOString(), values: converted })
        setValues({})
      },
      { title: "Sensor reading added", description: `Telemetry was saved for ${process.name}.` },
      "Could not save sensor reading"
    )
  }

  if (process.sensors.length === 0) {
    return <p className="text-sm text-muted-foreground">Define at least one sensor below before adding data.</p>
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={mode === "manual" ? "default" : "outline"} size="sm" onClick={() => setMode("manual")}>
          Single entry
        </Button>
        <Button type="button" variant={mode === "json" ? "default" : "outline"} size="sm" onClick={() => setMode("json")}>
          JSON import
        </Button>
      </div>

      {mode === "manual" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="timestamp">Timestamp</Label>
            <Input id="timestamp" type="datetime-local" value={timestamp} onChange={(event) => setTimestamp(event.target.value)} required />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {process.sensors.map((sensor) => (
              <div key={sensor.id} className="space-y-2">
                <Label htmlFor={`sensor-${sensor.id}`}>
                  {sensor.name} <span className="text-xs font-normal text-muted-foreground">({sensor.dataType})</span>
                </Label>
                {sensor.dataType === "boolean" ? (
                  <select
                    id={`sensor-${sensor.id}`}
                    value={values[sensor.key] ?? ""}
                    onChange={(event) => setValues((current) => ({ ...current, [sensor.key]: event.target.value }))}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                  >
                    <option value="">No value</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <Input
                    id={`sensor-${sensor.id}`}
                    type={sensor.dataType === "number" ? "number" : "text"}
                    step={sensor.dataType === "number" ? "any" : undefined}
                    value={values[sensor.key] ?? ""}
                    onChange={(event) => setValues((current) => ({ ...current, [sensor.key]: event.target.value }))}
                    placeholder={sensor.dataType === "number" ? "0.0" : "Text value"}
                  />
                )}
              </div>
            ))}
          </div>
          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Add sensor data"}
          </Button>
        </>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sensor-json-file">JSON file</Label>
            <Input id="sensor-json-file" type="file" accept=".json,application/json" onChange={readJsonFile} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sensor-json-payload">JSON payload</Label>
            <Textarea
              id="sensor-json-payload"
              value={jsonPayload}
              onChange={(event) => setJsonPayload(event.target.value)}
              className="min-h-56 font-mono text-xs"
              placeholder={sensorJsonExample}
            />
          </div>
          <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-4">
            <p className="text-sm font-medium">Structure</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Values are keyed by sensor id and must match the sensor&apos;s type exactly (numbers as JSON numbers, booleans as true/false, text as strings). If any value is invalid, nothing is imported and every problem is reported.
            </p>
            <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">{sensorJsonExample}</pre>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Importing..." : "Import sensor JSON"}
          </Button>
        </div>
      )}
    </form>
  )
}
