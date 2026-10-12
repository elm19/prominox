"use client"

import * as React from "react"

import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { MaintenanceLog, MaintenanceStatus, MaintenanceType } from "@/lib/types"

const maintenanceTypes: MaintenanceType[] = ["inspection", "preventive", "corrective", "calibration", "lubrication"]
const maintenanceStatuses: MaintenanceStatus[] = ["solved", "pending", "in_progress"]

function nowLocal() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

export function AddMaintenanceLogForm({
  processId,
  processName,
  onSubmit,
  onBulkSubmit,
}: {
  processId: number
  processName: string
  onSubmit: (log: MaintenanceLog) => Promise<void>
  onBulkSubmit: (logs: MaintenanceLog[]) => Promise<void>
}) {
  const { toast } = useToast()
  const [mode, setMode] = React.useState<"manual" | "json">("manual")
  const [timestamp, setTimestamp] = React.useState(nowLocal)
  const [type, setType] = React.useState<MaintenanceType>("inspection")
  const [status, setStatus] = React.useState<MaintenanceStatus>("pending")
  const [description, setDescription] = React.useState("")
  const [downtimeHours, setDowntimeHours] = React.useState("0")
  const [technician, setTechnician] = React.useState("")
  const [jsonPayload, setJsonPayload] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const maintenanceJsonExample = React.useMemo(
    () =>
      JSON.stringify(
        {
          processId,
          logs: [
            {
              timestamp: "2026-05-06T09:15:00Z",
              type: "preventive",
              description: "Inspected bearings and cleaned intake filters.",
              status: "solved",
              downtimeHours: 1.5,
              technician: "Ayo Ibitoye",
            },
          ],
        },
        null,
        2
      ),
    [processId]
  )

  const readJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setJsonPayload(await file.text())
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (mode === "json") {
      await submitJson()
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        id: 0,
        processId,
        timestamp: new Date(timestamp).toISOString(),
        type,
        description,
        status,
      downtimeHours: Number.parseFloat(downtimeHours || "0"),
      technician,
    })
      toast({
        title: "Maintenance log added",
        description: `The log was saved for ${processName}.`,
      })
      setDescription("")
      setDowntimeHours("0")
      setTechnician("")
    } catch (error) {
      toast({
        title: "Could not save maintenance log",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        tone: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitJson = async () => {
    setIsSubmitting(true)
    try {
      const parsed = JSON.parse(jsonPayload) as {
        logs?: Array<{
          timestamp: string
          type: MaintenanceType
          description: string
          status: MaintenanceStatus
          downtimeHours?: number
          technician?: string
        }>
      }

      if (!Array.isArray(parsed.logs) || parsed.logs.length === 0) {
        throw new Error("JSON must include a non-empty logs array.")
      }

      const normalized = parsed.logs.map((log) => {
        if (!log.timestamp || !log.type || !log.description || !log.status) {
          throw new Error("Each maintenance log must include timestamp, type, description, and status.")
        }

        return {
          id: 0,
          processId,
          timestamp: new Date(log.timestamp).toISOString(),
          type: log.type,
          description: log.description,
          status: log.status,
          downtimeHours: Number(log.downtimeHours ?? 0),
          technician: log.technician ?? "Not assigned",
        }
      })

      await onBulkSubmit(normalized)
      toast({
        title: "Maintenance batch imported",
        description: `${normalized.length} maintenance logs were saved for ${processName}.`,
      })
      setJsonPayload("")
    } catch (error) {
      toast({
        title: "Could not import maintenance JSON",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        tone: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="maintenance-time">Date and time</Label>
              <Input id="maintenance-time" type="datetime-local" value={timestamp} onChange={(event) => setTimestamp(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-technician">Technician</Label>
              <Input id="maintenance-technician" value={technician} onChange={(event) => setTechnician(event.target.value)} placeholder="Technician name" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="maintenance-type">Type</Label>
              <select
                id="maintenance-type"
                value={type}
                onChange={(event) => setType(event.target.value as MaintenanceType)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
              >
                {maintenanceTypes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-status">Status</Label>
              <select
                id="maintenance-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as MaintenanceStatus)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
              >
                {maintenanceStatuses.map((option) => (
                  <option key={option} value={option}>
                    {option.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="downtime-hours">Downtime hours</Label>
              <Input id="downtime-hours" inputMode="decimal" value={downtimeHours} onChange={(event) => setDowntimeHours(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maintenance-description">Description</Label>
            <Textarea id="maintenance-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the intervention, observations, and outcome." required />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Add maintenance log"}
          </Button>
        </>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="maintenance-json-file">JSON file</Label>
            <Input id="maintenance-json-file" type="file" accept=".json,application/json" onChange={readJsonFile} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maintenance-json-payload">JSON payload</Label>
            <Textarea
              id="maintenance-json-payload"
              value={jsonPayload}
              onChange={(event) => setJsonPayload(event.target.value)}
              className="min-h-56 font-mono text-xs"
              placeholder={maintenanceJsonExample}
            />
          </div>
          <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-4">
            <p className="text-sm font-medium">Recommended structure</p>
            <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">{maintenanceJsonExample}</pre>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Importing..." : "Import maintenance JSON"}
          </Button>
        </div>
      )}
    </form>
  )
}
