"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, CircleHelp, Download, Plus, Wrench } from "@/lib/icons"

import { addReadings, createMaintenanceLog, exportUrl } from "@/lib/api"
import { SensorExplorer } from "@/components/charts/sensor-visualization"
import { ImageGallery } from "@/components/processes/image-gallery"
import { LiveTelemetry } from "@/components/processes/live-telemetry"
import { RrtPanel } from "@/components/processes/rrt-panel"
import { SensorManager } from "@/components/processes/sensor-manager"
import { EmptyState } from "@/components/dashboard/empty-state"
import { AddMaintenanceLogForm } from "@/components/forms/add-maintenance-log-form"
import { AddSensorDataForm } from "@/components/forms/add-sensor-data-form"
import { MaintenanceLogTable } from "@/components/processes/maintenance-log-table"
import { ProcessStatusBadge, ProcessTypeBadge, RrtBadge } from "@/components/processes/process-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCapacity } from "@/lib/utils"
import { getProcessKpis } from "@/lib/kpi-utils"
import { cn } from "@/lib/utils"
import type { Process, MaintenanceLog, ProductFlow, SensorReading } from "@/lib/types"

const TABS = [
  { id: "telemetry", label: "Telemetry" },
  { id: "overview", label: "Overview" },
  { id: "sensors", label: "Sensors & live" },
  { id: "maintenance", label: "Maintenance" },
  { id: "data", label: "Data & export" },
] as const
type TabId = (typeof TABS)[number]["id"]

export function ProcessDetailView({ process, flows }: { process: Process; flows: ProductFlow[] }) {
  const router = useRouter()
  const { sensorData, maintenanceLogs } = process
  const searchParams = useSearchParams()
  const initialTab = TABS.find((item) => item.id === searchParams.get("tab"))?.id ?? "telemetry"
  const [tab, setTab] = React.useState<TabId>(initialTab)
  const [showMaintenanceForm, setShowMaintenanceForm] = React.useState(false)

  const kpis = getProcessKpis(process)

  const selectTab = (next: TabId) => {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", next)
    window.history.replaceState(null, "", url)
  }

  const saveReadings = async (readings: SensorReading[]) => {
    await addReadings(process.id, readings)
    router.refresh()
  }

  const saveLogs = async (logs: MaintenanceLog[]) => {
    for (const log of logs) {
      await createMaintenanceLog({
        process_id: process.id,
        performed_at: log.timestamp,
        type: log.type,
        description: log.description,
        status: log.status,
        downtime_hours: log.downtimeHours,
        technician: log.technician || undefined,
      })
    }
    setShowMaintenanceForm(false)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Link href="/processes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Processes
        </Link>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{process.name}</h1>
              <ProcessStatusBadge status={process.status} />
              <span className="text-sm text-muted-foreground">{process.code}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {process.department ? <Badge variant="info">{process.department.name}</Badge> : null}
              <ProcessTypeBadge type={process.type} />
              {process.rrtEnabled ? <RrtBadge /> : null}
              <Badge variant="outline">Capacity {formatCapacity(process.capacity)}</Badge>
              <Badge variant="outline">Quantity x{process.quantity}</Badge>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/processes/${process.id}/edit`}>Edit process</Link>
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label="Process sections" className="flex gap-1 overflow-x-auto border-b border-border/70">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => selectTab(item.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
            {item.id === "sensors" ? <span className="ml-1.5 text-xs text-muted-foreground">{process.sensors.length}</span> : null}
            {item.id === "maintenance" ? <span className="ml-1.5 text-xs text-muted-foreground">{maintenanceLogs.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === "telemetry" ? (
        process.sensors.length === 0 ? (
          <EmptyState
            title="No sensors yet"
            description="Create sensors first, then add readings to see their trends here."
            action={
              <Button onClick={() => selectTab("sensors")}>
                <Plus className="size-4" />
                Set up sensors
              </Button>
            }
          />
        ) : process.rrtEnabled ? (
          <LiveTelemetry process={process} />
        ) : sensorData.length === 0 ? (
          <EmptyState
            title="No sensor data yet"
            description="Telemetry has not been collected for this process yet. Add sensor values to activate the charts and build the dataset."
            action={
              <Button onClick={() => selectTab("data")}>
                <Plus className="size-4" />
                Add first sensor reading
              </Button>
            }
          />
        ) : (
          <SensorExplorer sensors={process.sensors} readings={sensorData} />
        )
      ) : null}

      {tab === "overview" ? (
        <div className="space-y-6">
          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="bg-card/80">
              <CardHeader className="py-4">
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="max-w-3xl whitespace-pre-line text-sm leading-6 text-muted-foreground">{process.description || "No description."}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/80">
              <CardHeader className="py-4">
                <CardTitle className="text-base">KPI snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pb-4">
                {kpis.map((kpi) => (
                  <div
                    key={kpi.label}
                    className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_1.75rem] items-center gap-3 border-t border-border/70 py-1.5 first:border-t-0"
                  >
                    <p className="min-w-0 truncate text-sm font-medium">{kpi.label}</p>
                    <p className="text-right text-lg font-semibold tabular-nums tracking-tight">{kpi.value}</p>
                    {kpi.helpHref ? (
                      <Button asChild variant="ghost" size="icon-xs">
                        <Link href={kpi.helpHref} aria-label={`Learn more about ${kpi.label}`} title={`Learn more about ${kpi.label}`}>
                          <CircleHelp className="size-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
          {process.latestPrediction ? (
            <Card className="bg-card/80">
              <CardHeader className="flex-row items-center justify-between gap-3 py-4">
                <CardTitle className="text-base">Failure risk (AI Lab)</CardTitle>
                <Badge variant={process.latestPrediction.status === "healthy" ? "success" : process.latestPrediction.status === "observe" ? "warning" : "danger"}>
                  {process.latestPrediction.status === "healthy" ? "Healthy" : process.latestPrediction.status === "observe" ? "Watch" : "Service soon"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-1 pb-4 text-sm">
                <p>{process.latestPrediction.result}</p>
                {process.latestPrediction.nextMaintenanceDate ? (
                  <p className="text-muted-foreground">Next corrective intervention expected around {new Date(process.latestPrediction.nextMaintenanceDate).toLocaleDateString("en-US", { dateStyle: "medium" })}.</p>
                ) : null}
                <p className="text-xs text-muted-foreground">Updated {new Date(process.latestPrediction.lastPredictionDate).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · data confidence {Math.round(process.latestPrediction.confidence * 100)}%</p>
              </CardContent>
            </Card>
          ) : null}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Images</h2>
            <ImageGallery images={process.images} processName={process.name} />
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Products</h2>
            {flows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No product uses this process yet.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {flows.map((flow) => (
                  <Link key={flow.productId} href={`/products/${flow.productId}`} className="inline-flex items-center gap-2 border bg-card/80 px-3 py-2 text-sm hover:border-primary/50" style={{ borderLeft: `4px solid ${flow.color}` }}>
                    <span className="font-medium">{flow.reference}</span>
                    <span className="text-muted-foreground">{flow.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {tab === "sensors" ? (
        <div className="space-y-6">
          <SensorManager process={process} />
          {process.type === "machine" ? <RrtPanel process={process} /> : null}
        </div>
      ) : null}

      {tab === "maintenance" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowMaintenanceForm((current) => !current)} variant={showMaintenanceForm ? "outline" : "default"}>
              <Wrench className="size-4" />
              {showMaintenanceForm ? "Cancel" : "Add maintenance log"}
            </Button>
          </div>
          {showMaintenanceForm ? (
            <div className="border border-border/70 bg-card/80 p-4">
              <AddMaintenanceLogForm processId={process.id} processName={process.name} onSubmit={(log) => saveLogs([log])} onBulkSubmit={saveLogs} />
            </div>
          ) : null}
          {maintenanceLogs.length ? (
            <Card className="bg-card/80">
              <CardContent className="py-5">
                <MaintenanceLogTable logs={maintenanceLogs} />
              </CardContent>
            </Card>
          ) : (
            <EmptyState title="No maintenance logs recorded" description="This process has no intervention history yet. Add a log to update the workflow and KPI rollups." />
          )}
        </div>
      ) : null}

      {tab === "data" ? (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Add sensor data</h2>
            {process.sensors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Create a sensor in the Sensors &amp; live tab before adding readings.</p>
            ) : (
              <div className="border border-border/70 bg-card/80 p-4">
                <AddSensorDataForm process={process} onSubmit={(reading) => saveReadings([reading])} onBulkSubmit={saveReadings} />
              </div>
            )}
          </section>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Export</h2>
              <p className="text-sm text-muted-foreground">Download the data collected for this process as CSV, ready for AI training.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <a href={exportUrl.readings({ processId: process.id, format: "wide" })} download>
                  <Download className="size-4" />
                  Readings (one column per sensor)
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={exportUrl.readings({ processId: process.id, format: "long" })} download>
                  <Download className="size-4" />
                  Readings (long format)
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={exportUrl.maintenanceLogs(process.id)} download>
                  <Download className="size-4" />
                  Maintenance logs
                </a>
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
