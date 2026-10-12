"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { createSensor, deleteSensor, updateSensor } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { Plus, X } from "@/lib/icons"
import { EmptyState } from "@/components/dashboard/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import type { Process, SensorDataType, SensorDefinition } from "@/lib/types"

const dataTypes: { value: SensorDataType; label: string; hint: string }[] = [
  { value: "number", label: "Number", hint: "Integers and decimals, shown as a line chart" },
  { value: "boolean", label: "Boolean", hint: "True / false, shown as an on-off timeline" },
  { value: "text", label: "Text", hint: "Any string, shown as a timeline of values" },
]

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"

export function SensorManager({ process }: { process: Process }) {
  const router = useRouter()
  const { toast } = useToast()
  const [adding, setAdding] = React.useState(false)
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [name, setName] = React.useState("")
  const [dataType, setDataType] = React.useState<SensorDataType>("number")
  const [description, setDescription] = React.useState("")
  const [editName, setEditName] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true)
    try {
      await action()
      router.refresh()
    } catch (error) {
      toast({ title: failure, description: describeError(error), tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  const create = (event: React.FormEvent) => {
    event.preventDefault()
    return run(async () => {
      await createSensor(process.id, { name: name.trim(), data_type: dataType, description: description.trim() || null })
      toast({ title: "Sensor created", description: `${name.trim()} (${dataType})` })
      setName("")
      setDescription("")
      setAdding(false)
    }, "Could not create sensor")
  }

  const startEdit = (sensor: SensorDefinition) => {
    setEditingId(sensor.id)
    setEditName(sensor.name)
    setEditDescription(sensor.description ?? "")
  }

  const saveEdit = (event: React.FormEvent) => {
    event.preventDefault()
    return run(async () => {
      await updateSensor(process.id, editingId as number, { name: editName.trim(), description: editDescription.trim() || null })
      setEditingId(null)
    }, "Could not update sensor")
  }

  const remove = (sensor: SensorDefinition) => {
    if (!window.confirm(`Delete sensor "${sensor.name}" and all of its readings? This cannot be undone.`)) return
    return run(async () => {
      await deleteSensor(process.id, sensor.id)
      toast({ title: "Sensor deleted", description: sensor.name })
    }, "Could not delete sensor")
  }

  return (
    <Card className="bg-card/80">
      <CardHeader className="gap-3 md:flex md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Sensors</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Define what this process measures. Every imported value is checked against the sensor&apos;s data type.
          </p>
        </div>
        <Button onClick={() => setAdding((current) => !current)} variant={adding ? "outline" : "default"}>
          <Plus className="size-4" />
          {adding ? "Cancel" : "New sensor"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {adding ? (
          <form onSubmit={create} className="grid gap-4 rounded-xl border border-border/70 bg-background/70 p-4 md:grid-cols-[1fr_200px]">
            <div className="space-y-2">
              <Label htmlFor="sensor-name">Name</Label>
              <Input id="sensor-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Spindle temperature" required maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sensor-type">Data type</Label>
              <select id="sensor-type" value={dataType} onChange={(event) => setDataType(event.target.value as SensorDataType)} className={selectClass}>
                {dataTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="sensor-description">Description (optional)</Label>
              <Input id="sensor-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this sensor measure?" />
              <p className="text-xs text-muted-foreground">{dataTypes.find((type) => type.value === dataType)?.hint}. The type cannot be changed later.</p>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={busy || !name.trim()}>
                Create sensor
              </Button>
            </div>
          </form>
        ) : null}

        {process.sensors.length === 0 ? (
          <EmptyState title="No sensors defined" description="Create the first sensor to start collecting data for this process." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/70">
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Description</th>
                  <th className="px-3 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {process.sensors.map((sensor) =>
                  editingId === sensor.id ? (
                    <tr key={sensor.id} className="border-b border-border/50">
                      <td colSpan={4} className="px-3 py-3">
                        <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
                          <Input value={editName} onChange={(event) => setEditName(event.target.value)} aria-label="Sensor name" required maxLength={100} />
                          <Input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} aria-label="Sensor description" placeholder="Description" />
                          <div className="flex gap-2">
                            <Button type="submit" size="sm" disabled={busy || !editName.trim()}>
                              Save
                            </Button>
                            <Button type="button" size="icon-sm" variant="outline" onClick={() => setEditingId(null)} aria-label="Cancel edit">
                              <X className="size-4" />
                            </Button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={sensor.id} className="border-b border-border/50 last:border-b-0">
                      <td className="px-3 py-3 font-medium">{sensor.name}</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline">{sensor.dataType}</Badge>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{sensor.description || "-"}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="xs" variant="outline" onClick={() => startEdit(sensor)} disabled={busy}>
                            Edit
                          </Button>
                          <Button size="xs" variant="destructive" onClick={() => remove(sensor)} disabled={busy}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
