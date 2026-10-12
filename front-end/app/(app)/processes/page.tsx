import Link from "next/link"
import { Plus } from "@/lib/icons"

import { PageHeader } from "@/components/dashboard/page-header"
import { ProcessTable } from "@/components/processes/process-table"
import { Button } from "@/components/ui/button"
import { getDataset } from "@/lib/api"

export const metadata = {
  title: "Factory processes",
}

export default async function ProcessesPage() {
  const { processes } = await getDataset()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Processes"
        title="Factory processes"
        description="Search, filter, and inspect every production process across telemetry readiness, maintenance activity, and collected data."
        actions={
          <Button asChild>
            <Link href="/processes/add">
              <Plus className="size-4" />
              Add process
            </Link>
          </Button>
        }
      />
      <ProcessTable processes={processes} />
    </div>
  )
}
