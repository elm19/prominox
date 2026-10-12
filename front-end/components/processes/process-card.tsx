import Link from "next/link"
import { ArrowRight, CircleHelp, Cpu, MapPin, Waves } from "@/lib/icons"

import { getProcessKpis, getRelativeUpdate } from "@/lib/kpi-utils"
import type { Process } from "@/lib/types"
import { formatCapacity } from "@/lib/utils"
import { ProcessStatusBadge, ProcessTypeBadge, RrtBadge } from "@/components/processes/process-status-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ProcessCard({ process }: { process: Process }) {
  const kpis = getProcessKpis(process).slice(0, 2)

  return (
    <Card className="h-full bg-card/80">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{process.name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{process.code}</p>
          </div>
          <ProcessStatusBadge status={process.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          <ProcessTypeBadge type={process.type} />
          {process.rrtEnabled ? <RrtBadge /> : null}
          <Badge variant="outline">Capacity {formatCapacity(process.capacity)}</Badge>
          <Badge variant="outline">x{process.quantity}</Badge>
          {process.sensors.map((sensor) => (
            <Badge key={sensor.id} variant="outline">
              {sensor.name}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            <span>{process.department?.name ?? "No department"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Waves className="size-4 text-primary" />
            <span>{getRelativeUpdate(process.lastUpdate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" />
            <span>{process.sensorData.length ? `${process.sensorData.length} telemetry points` : "No telemetry yet"}</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-border/70 bg-background/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{kpi.label}</p>
                {kpi.helpHref ? (
                  <Link
                    href={kpi.helpHref}
                    aria-label={`Learn more about ${kpi.label}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <CircleHelp className="size-3.5" />
                  </Link>
                ) : null}
              </div>
              <p className="mt-2 text-xl font-semibold">{kpi.value}</p>
            </div>
          ))}
        </div>
        <Link
          href={`/processes/${process.id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary"
        >
          View process
          <ArrowRight className="size-4" />
        </Link>
      </CardContent>
    </Card>
  )
}
