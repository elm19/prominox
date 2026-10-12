"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Download, Plus, Search } from "@/lib/icons"

import { AddMaintenanceLogForm } from "@/components/forms/add-maintenance-log-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createMaintenanceLog, exportUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Process, MaintenanceLog, MaintenanceType } from "@/lib/types"

type MaintenanceLogWithProcess = MaintenanceLog & {
  processName: string
  processCode: string
  processDepartment: string
}

const typeStyles: Record<MaintenanceType, string> = {
  inspection: "border-l-sky-500 bg-sky-500/5",
  preventive: "border-l-emerald-500 bg-emerald-500/5",
  corrective: "border-l-rose-500 bg-rose-500/5",
  calibration: "border-l-violet-500 bg-violet-500/5",
  lubrication: "border-l-amber-500 bg-amber-500/5",
}

const statusVariant = {
  solved: "success",
  pending: "warning",
  in_progress: "info",
} as const

function normalizeLog(log: MaintenanceLog, process: Process): MaintenanceLogWithProcess {
  return {
    ...log,
    processName: process.name,
    processCode: process.code,
    processDepartment: process.department?.name ?? "",
  }
}

export function MaintenanceLogsView({ processes }: { processes: Process[] }) {
  const router = useRouter()
  const [selectedProcessId, setSelectedProcessId] = React.useState<number | undefined>(processes[0]?.id)
  const [query, setQuery] = React.useState("")
  const [type, setType] = React.useState<MaintenanceType | "all">("all")
  const logs = React.useMemo<MaintenanceLogWithProcess[]>(
    () =>
      processes
        .flatMap((process) => process.maintenanceLogs.map((log) => normalizeLog(log, process)))
        .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)),
    [processes]
  )
  const [showForm, setShowForm] = React.useState(false)

  const selectedProcess = processes.find((process) => process.id === selectedProcessId) ?? processes[0]
  const filteredLogs = logs.filter((log) => {
    const normalizedQuery = query.toLowerCase()
    const matchesQuery =
      log.processName.toLowerCase().includes(normalizedQuery) ||
      log.processCode.toLowerCase().includes(normalizedQuery) ||
      log.description.toLowerCase().includes(normalizedQuery) ||
      log.technician.toLowerCase().includes(normalizedQuery)
    const matchesType = type === "all" || log.type === type

    return matchesQuery && matchesType
  })

  const insertLogs = async (newLogs: MaintenanceLog[]) => {
    if (!selectedProcess) return
    for (const log of newLogs) {
      await createMaintenanceLog({
        process_id: selectedProcess.id,
        performed_at: log.timestamp,
        type: log.type,
        description: log.description,
        status: log.status,
        downtime_hours: log.downtimeHours,
        technician: log.technician || undefined,
      })
    }
    setShowForm(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card/80">
        <CardHeader className="gap-4 md:flex md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Add maintenance log</CardTitle>
            <p className="text-sm text-muted-foreground">Choose the process, then record the intervention details.</p>
          </div>
          <Button onClick={() => setShowForm((current) => !current)}>
            <Plus className="size-4" />
            New log
          </Button>
        </CardHeader>
        {showForm ? (
          <CardContent className="space-y-4">
            <div className="max-w-xl space-y-2">
              <label htmlFor="maintenance-process" className="text-sm font-medium">
                Process
              </label>
              <select
                id="maintenance-process"
                value={selectedProcess?.id ?? ""}
                onChange={(event) => setSelectedProcessId(Number(event.target.value))}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {processes.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name} - {process.code}
                  </option>
                ))}
              </select>
            </div>
            {selectedProcess ? (
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <AddMaintenanceLogForm
                  processId={selectedProcess.id}
                  processName={selectedProcess.name}
                  onSubmit={(log) => insertLogs([log])}
                  onBulkSubmit={insertLogs}
                />
              </div>
            ) : null}
          </CardContent>
        ) : null}
      </Card>

      <Card className="bg-card/80">
        <CardHeader className="gap-4 lg:flex lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>Maintenance history</CardTitle>
            <a href={exportUrl.maintenanceLogs()} download className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              <Download className="size-4" />
              Export CSV
            </a>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search logs, processes, or technicians"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as MaintenanceType | "all")}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              aria-label="Filter by maintenance type"
            >
              <option value="all">All types</option>
              <option value="inspection">Inspection</option>
              <option value="preventive">Preventive</option>
              <option value="corrective">Corrective</option>
              <option value="calibration">Calibration</option>
              <option value="lubrication">Lubrication</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/70">
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Process</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Description</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Downtime</th>
                  <th className="px-3 py-3 font-medium">Technician</th>
                  <th className="px-3 py-3 font-medium">Open</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className={cn("border-b border-border/50 border-l-4 last:border-b-0", typeStyles[log.type])}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/processes/${log.processId}`} className="font-medium text-primary">
                        {log.processName}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{log.processCode}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className="capitalize">
                        {log.type.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="max-w-sm px-3 py-3 text-muted-foreground">
                      <p className="line-clamp-2">{log.description}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={statusVariant[log.status]}>{log.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{log.downtimeHours.toFixed(1)} h</td>
                    <td className="px-3 py-3 whitespace-nowrap">{log.technician}</td>
                    <td className="px-3 py-3">
                      <Link href={`/maintenance/${log.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                        Details
                        <ArrowRight className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                No maintenance logs match the current filters.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
