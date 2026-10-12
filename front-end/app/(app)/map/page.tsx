import { PageHeader } from "@/components/dashboard/page-header"
import { FactoryMap } from "@/components/processes/factory-map"
import { getDataset, getProductFlows } from "@/lib/api"

export const metadata = {
  title: "Factory map",
}

export default async function FactoryMapPage() {
  const [{ processes, departments }, flows] = await Promise.all([getDataset(), getProductFlows()])

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Digital twin"
        title="Factory map"
        description="Every process grouped by department, with each product's flow drawn in its own colour. Drag departments and processes to match the shop floor, then save the layout."
      />
      <FactoryMap processes={processes} departments={departments} flows={flows} />
    </div>
  )
}
