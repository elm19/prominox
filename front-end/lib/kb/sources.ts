// Knowledge sources the user can switch on or off in the chat panel (kept apart from the tools so the browser bundle stays small)
export type SourceId = "docs" | "page" | "factory" | "products" | "ai"

export const SOURCES: { id: SourceId; label: string; description: string }[] = [
  { id: "docs", label: "Company & app guide", description: "What the company does, what each page offers, how the models work, KPI definitions." },
  { id: "page", label: "Current page", description: "The process or product you are looking at." },
  { id: "factory", label: "Factory data", description: "Processes, sensors and live readings, maintenance logs, KPIs." },
  { id: "products", label: "Products & production", description: "Catalogue, routings, specs and past production runs." },
  { id: "ai", label: "AI Lab & simulation", description: "Failure-risk ranking, forecasts, anomaly scans, production estimates and what-if simulations." },
]
