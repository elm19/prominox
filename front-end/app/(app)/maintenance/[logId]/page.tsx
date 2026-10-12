import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Clock, Factory, Wrench } from "@/lib/icons"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/dashboard/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getMaintenanceLog, getProcess } from "@/lib/api"
import type { MaintenanceLog } from "@/lib/types"

const statusVariant = {
  solved: "success",
  pending: "warning",
  in_progress: "info",
} as const

function formatType(type: MaintenanceLog["type"]) {
  return type.replace("_", " ")
}

export async function generateMetadata(props: PageProps<"/maintenance/[logId]">): Promise<Metadata> {
  const { logId } = await props.params
  const log = Number.isInteger(Number(logId)) ? await getMaintenanceLog(Number(logId)) : null

  return {
    title: log ? `Maintenance ${formatType(log.type)}` : "Maintenance log",
  }
}

export default async function MaintenanceLogDetailPage(props: PageProps<"/maintenance/[logId]">) {
  const { logId } = await props.params
  const log = Number.isInteger(Number(logId)) ? await getMaintenanceLog(Number(logId)) : null
  const process = log ? await getProcess(log.processId) : null

  if (!process || !log) {
    notFound()
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Maintenance detail"
        title={`${formatType(log.type)} log`}
        description={log.description}
        actions={
          <Button asChild variant="outline">
            <Link href="/maintenance">
              <ArrowLeft className="size-4" />
              Back to maintenance
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle>Log summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="capitalize">
                {formatType(log.type)}
              </Badge>
              <Badge variant={statusVariant[log.status]}>{log.status.replace("_", " ")}</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-4" />
                  Performed at
                </p>
                <p className="mt-2 font-medium">
                  {new Date(log.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Wrench className="size-4" />
                  Technician
                </p>
                <p className="mt-2 font-medium">{log.technician}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Downtime</p>
                <p className="mt-2 font-medium">{log.downtimeHours.toFixed(1)} h</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Record ID</p>
                <p className="mt-2 font-mono text-xs">{log.id}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle>Process context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href={`/processes/${process.id}`} className="inline-flex items-center gap-2 text-lg font-semibold text-primary">
              <Factory className="size-5" />
              {process.name}
            </Link>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Code</p>
                <p className="mt-2 font-medium">{process.code}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Department</p>
                <p className="mt-2 font-medium">{process.department?.name ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Sensors</p>
                <p className="mt-2 font-medium">{process.sensors.length}</p>
              </div>
            </div>
            <p className="rounded-lg border border-border/70 bg-background/70 p-4 text-sm leading-6 text-muted-foreground">
              {process.description}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
