import { PageHeader } from "@/components/dashboard/page-header"
import { MaintenanceLogsView } from "@/components/maintenance/maintenance-logs-view"
import { getDataset } from "@/lib/api"

export const metadata = {
  title: "Maintenance logs",
}

export default async function MaintenancePage() {
  const { processes } = await getDataset()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Maintenance"
        title="Maintenance logs"
        description="Review factory-wide interventions, downtime, technicians, and maintenance status across every process."
      />
      <MaintenanceLogsView processes={processes} />
    </div>
  )
}
