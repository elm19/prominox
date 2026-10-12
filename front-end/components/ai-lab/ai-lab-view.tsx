"use client"

import * as React from "react"

import type { AiCatalog, MaintenanceRisk } from "@/lib/api"
import { AnomalyPanel } from "@/components/ai-lab/anomaly-panel"
import { ForecastPanel } from "@/components/ai-lab/forecast-panel"
import { MaintenancePanel } from "@/components/ai-lab/maintenance-panel"
import { ProductionPanel } from "@/components/ai-lab/production-panel"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "forecast", label: "Sensor forecast" },
  { id: "anomalies", label: "Anomaly detection" },
  { id: "maintenance", label: "Failure risk" },
  { id: "production", label: "Production estimate" },
] as const
type TabId = (typeof TABS)[number]["id"]

export function AiLabView({ catalog, risk }: { catalog: AiCatalog; risk: MaintenanceRisk[] }) {
  const [tab, setTab] = React.useState<TabId>("forecast")
  return (
    <div className="space-y-5">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border/70">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "forecast" ? <ForecastPanel processes={catalog.processes} /> : null}
      {tab === "anomalies" ? <AnomalyPanel processes={catalog.processes} /> : null}
      {tab === "maintenance" ? <MaintenancePanel initial={risk} /> : null}
      {tab === "production" ? <ProductionPanel products={catalog.products} /> : null}
    </div>
  )
}
