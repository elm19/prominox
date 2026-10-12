import { PageHeader } from "@/components/dashboard/page-header"
import { SimulationView } from "@/components/simulation/simulation-view"
import { getSimCatalog } from "@/lib/api"

export const metadata = {
  title: "Simulation",
}

export default async function SimulationPage() {
  const catalog = await getSimCatalog()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Simulation"
        title="Production simulation"
        description="Choose what to produce, check it can be done with the current processes, and watch how long it takes."
      />
      <SimulationView catalog={catalog} />
    </div>
  )
}
