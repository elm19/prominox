import { Broadcast } from "@/lib/icons"
import { Badge } from "@/components/ui/badge"
import type { ProcessStatus, ProcessType } from "@/lib/types"

const statusConfig = {
  active: { label: "Active", variant: "success" as const },
  inactive: { label: "Inactive", variant: "outline" as const },
}

export function ProcessStatusBadge({ status }: { status: ProcessStatus }) {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function ProcessTypeBadge({ type }: { type: ProcessType }) {
  return (
    <Badge variant="outline" className="capitalize">
      {type}
    </Badge>
  )
}

export function RrtBadge() {
  return (
    <Badge variant="success" title="Receives live data from Node-RED">
      <Broadcast className="mr-1 size-3" />
      RRT
    </Badge>
  )
}
