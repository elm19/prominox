import { KPI_DEFINITIONS, getKpiHelpHref } from "@/lib/kpi-definitions"
import { getDataset, getProcess, getProduct } from "@/lib/api"
import { getProcessKpis } from "@/lib/kpi-utils"

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "Not available"
}

/** KPI definitions as text, for the "Company & app guide" source. */
export function getKpiGuideText() {
  return KPI_DEFINITIONS.map((definition) => {
    const inputs = definition.operatorInputs.join(", ")
    return `${definition.label} (${definition.slug}): ${definition.shortDescription} Formula: ${definition.formula} Inputs: ${inputs}. Help page: ${getKpiHelpHref(definition.slug)}`
  }).join("\n")
}

/** What the user is looking at right now (the "Current page" source). */
export async function getChatbotContext(pathname: string) {
  const pageNames: Record<string, string> = {
    "/products": "Products catalogue.",
    "/map": "Factory map, a spatial view of processes grouped by department.",
    "/departments": "Departments.",
    "/simulation": "Production simulation: the user picks products and quantities, then runs a what-if simulation.",
    "/ai-lab": "AI Lab with four tabs: sensor forecast, anomaly detection, failure risk, production estimate.",
    "/account": "The user's account settings.",
    "/admin/users": "User account management (administrators).",
    "/admin/export": "Bulk CSV data export (administrators).",
    "/help/kpis": "KPI help guide index.",
  }
  const processMatch = pathname.match(/^\/processes\/([^/]+)/)

  if (processMatch?.[1] && processMatch[1] !== "add") {
    const id = Number(decodeURIComponent(processMatch[1]))
    const process = Number.isInteger(id) ? await getProcess(id) : null

    if (!process) {
      return "The current URL references a process that is not available in the current data."
    }

    const latestReading = process.sensorData.at(-1)
    const processKpis = getProcessKpis(process)

    return [
      `Current process page: ${process.name} (${process.code})`,
      `Type: ${process.type}; department: ${process.department?.name ?? "none"}; capacity: ${process.capacity === 0 ? "dynamic" : process.capacity}; quantity: ${process.quantity}`,
      `Department: ${process.department?.name ?? "none"}`,
      `Status: ${process.status}`,
      `Description: ${process.description}`,
      `Last update: ${formatDate(process.lastUpdate)}`,
      `Scheduled hours in last 30 days: ${process.scheduledHours30d}`,
      `Sensors: ${process.sensors.map((sensor) => `${sensor.name} (${sensor.dataType})`).join(", ") || "None"}`,
      `Latest sensor reading: ${
        latestReading ? `${formatDate(latestReading.timestamp)} with ${JSON.stringify(latestReading.values)}` : "No sensor data yet"
      }`,
      `Process KPIs: ${processKpis.map((kpi) => `${kpi.label}=${kpi.value} (${kpi.helpHref})`).join(", ")}`,
      `Maintenance logs: ${
        process.maintenanceLogs.length
          ? process.maintenanceLogs
              .map((log) => `${formatDate(log.timestamp)} - ${log.type} - ${log.status} - ${log.description} (${log.downtimeHours}h downtime)`)
              .join("; ")
          : "No maintenance logs"
      }`,
    ].join("\n")
  }

  const productMatch = pathname.match(/^\/products\/(\d+)/)
  if (productMatch) {
    const product = await getProduct(Number(productMatch[1]))
    if (!product) return "The current URL references a product that is not available in the current data."
    return [
      `Current product page: ${product.reference} ${product.name} (revision ${product.revision}, ${product.status})`,
      `Category: ${product.category ?? "none"}; material: ${product.material ?? "none"}; standard: ${product.standard ?? "none"}; unit: ${product.unit}`,
      `Specifications: ${product.specs.map((spec) => `${spec.name}=${spec.value}${spec.unit ? ` ${spec.unit}` : ""}`).join(", ") || "None"}`,
      `Routing: ${
        product.steps
          .map((step) => `${step.name} on ${step.processName}${step.standardDurationMinutes !== null ? ` (${step.standardDurationMinutes} min/unit)` : ""}, after [${step.dependsOnStepIds.map((id) => product.steps.find((s) => s.id === id)?.name).join(", ")}]`)
          .join("; ") || "No steps"
      }`,
      `Production history: ${product.stats.runCount} runs, ${product.stats.totalProduced} produced, ${product.stats.totalScrap} scrapped, yield ${product.stats.yieldPct ?? "n/a"}%, average lead time ${product.stats.avgLeadTimeHours ?? "n/a"} h`,
      `Files: ${product.files.length}`,
    ].join("\n")
  }

  if (pathname === "/processes") {
    const { processes } = await getDataset()
    return [
      "Current page: Processes list.",
      `Processes shown: ${processes.map((process) => `${process.name} (${process.code}, ${process.type}, ${process.status}, x${process.quantity}, ${process.department?.name})`).join("; ")}`,
    ].join("\n")
  }

  if (pathname === "/maintenance") {
    const { processes } = await getDataset()
    return [
      "Current page: Factory-wide maintenance logbook.",
      `Maintenance logs shown: ${processes
        .flatMap((process) =>
          process.maintenanceLogs.map(
            (log) => `${formatDate(log.timestamp)} - ${process.name} - ${log.type} - ${log.status} - ${log.description}`
          )
        )
        .join("; ") || "None"}`,
    ].join("\n")
  }

  const named = pageNames[pathname] ?? Object.entries(pageNames).find(([path]) => pathname.startsWith(`${path}/`))?.[1]
  return `Current page: ${named ?? pathname}`
}
