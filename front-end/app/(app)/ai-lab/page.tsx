import { AiLabView } from "@/components/ai-lab/ai-lab-view"
import { PageHeader } from "@/components/dashboard/page-header"
import { getAiCatalog, getMaintenanceRisk } from "@/lib/api"

export const metadata = {
  title: "AI Lab",
}

export default async function AiLabPage() {
  const [catalog, risk] = await Promise.all([getAiCatalog(), getMaintenanceRisk()])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Lab"
        title="AI Lab"
        description="Small, explainable models trained on the factory data you have collected. They run on demand, always on the latest data."
      />
      <AiLabView catalog={catalog} risk={risk} />
    </div>
  )
}
