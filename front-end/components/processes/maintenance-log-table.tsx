import { Badge } from "@/components/ui/badge"
import type { MaintenanceLog } from "@/lib/types"

const statusVariant = {
  solved: "success",
  pending: "warning",
  in_progress: "info",
} as const

export function MaintenanceLogTable({ logs }: { logs: MaintenanceLog[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border/70">
            <th className="px-3 py-3 font-medium">Date</th>
            <th className="px-3 py-3 font-medium">Type</th>
            <th className="px-3 py-3 font-medium">Description</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Downtime</th>
            <th className="px-3 py-3 font-medium">Technician</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-border/50 last:border-b-0">
              <td className="px-3 py-3">{new Date(log.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="px-3 py-3 capitalize">{log.type.replace("_", " ")}</td>
              <td className="px-3 py-3 text-muted-foreground">{log.description}</td>
              <td className="px-3 py-3">
                <Badge variant={statusVariant[log.status]}>{log.status.replace("_", " ")}</Badge>
              </td>
              <td className="px-3 py-3">{log.downtimeHours.toFixed(1)} h</td>
              <td className="px-3 py-3">{log.technician}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
