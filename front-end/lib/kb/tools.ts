import {
  getAiCatalog,
  getDataset,
  getMaintenanceRisk,
  getProcess,
  getProduct,
  getProductRuns,
  getProducts,
  getSensorSummary,
  runAnomalies,
  runForecast,
  runProductionEstimate,
  runSimulation,
  type SimStrategy,
} from "@/lib/api"
import { getFleetKpis, getProcessKpis } from "@/lib/kpi-utils"

export { SOURCES, type SourceId } from "@/lib/kb/sources"
import type { SourceId } from "@/lib/kb/sources"

type Schema = { type: "object"; properties: Record<string, { type: string; description: string; enum?: string[]; items?: unknown }>; required?: string[] }
type Args = Record<string, unknown>

export type Tool = {
  name: string
  label: string
  source: SourceId
  description: string
  parameters: Schema
  run: (args: Args) => Promise<unknown>
}

const num = (value: unknown, fallback?: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
const need = (value: unknown, name: string) => {
  const n = num(value)
  if (n === undefined) throw new Error(`${name} is required (use the list tools to find ids)`)
  return n
}
const round = (value: number | null | undefined, digits = 2) => (value === null || value === undefined ? null : Number(value.toFixed(digits)))
const empty: Schema = { type: "object", properties: {} }
const processId = { type: "integer", description: "Process id (see list_processes)" }
const productId = { type: "integer", description: "Product id (see list_products)" }

export const TOOLS: Tool[] = [
  {
    name: "list_processes",
    label: "process list",
    source: "factory",
    description: "List every process with id, code, type, status, department, number of instances, capacity, sensors and last update.",
    parameters: empty,
    run: async () => {
      const { processes } = await getDataset()
      return processes.map((p) => ({
        id: p.id, name: p.name, code: p.code, type: p.type, status: p.status, department: p.department?.name ?? null,
        instances: p.quantity, capacity: p.capacity === 0 ? "dynamic" : p.capacity, sensors: p.sensors.map((s) => `${s.name} (${s.dataType}, id ${s.id})`),
        liveReception: p.rrtEnabled, lastUpdate: p.lastUpdate, maintenanceLogs: p.maintenanceLogs.length,
      }))
    },
  },
  {
    name: "get_process",
    label: "process details",
    source: "factory",
    description: "Full details of one process: description, KPIs, sensors with their latest reading, recent maintenance and the latest AI failure-risk prediction.",
    parameters: { type: "object", properties: { process_id: processId }, required: ["process_id"] },
    run: async (args) => {
      const p = await getProcess(need(args.process_id, "process_id"))
      if (!p) throw new Error("Process not found")
      const latest = p.sensorData.at(-1)
      return {
        id: p.id, name: p.name, code: p.code, type: p.type, status: p.status, department: p.department?.name, description: p.description,
        instances: p.quantity, capacity: p.capacity === 0 ? "dynamic" : p.capacity, scheduledHours30d: p.scheduledHours30d, liveReception: p.rrtEnabled,
        lastUpdate: p.lastUpdate, kpis: getProcessKpis(p).map((k) => `${k.label}: ${k.value}`),
        sensors: p.sensors.map((s) => ({ id: s.id, name: s.name, type: s.dataType, latest: latest?.values[s.key] ?? null })),
        latestReadingAt: latest?.timestamp ?? null,
        recentMaintenance: p.maintenanceLogs.slice(0, 8).map((l) => ({ at: l.timestamp, type: l.type, status: l.status, downtimeHours: l.downtimeHours, description: l.description })),
        aiPrediction: p.latestPrediction,
      }
    },
  },
  {
    name: "get_sensor_summary",
    label: "sensor statistics",
    source: "factory",
    description: "Statistics for every sensor of a process over a time window ending at its newest reading: count, latest, min, max, mean, std, trend per hour (numbers), share of true (booleans), top values (text).",
    parameters: { type: "object", properties: { process_id: processId, hours: { type: "number", description: "Window length in hours (default 24)" } }, required: ["process_id"] },
    run: async (args) => {
      const data = await getSensorSummary(need(args.process_id, "process_id"), num(args.hours, 24)!)
      return { ...data, sensors: data.sensors.map((s) => ({ ...s, min: round(s.min), max: round(s.max), mean: round(s.mean), std: round(s.std), trend_per_hour: round(s.trend_per_hour, 3) })) }
    },
  },
  {
    name: "get_maintenance_logs",
    label: "maintenance logs",
    source: "factory",
    description: "Maintenance interventions, newest first. Optionally filter by process, type (inspection, preventive, corrective, calibration, lubrication) or status (solved, pending, in_progress).",
    parameters: {
      type: "object",
      properties: {
        process_id: { type: "integer", description: "Only this process (optional)" },
        type: { type: "string", description: "Intervention type (optional)" },
        status: { type: "string", description: "Status (optional)" },
        limit: { type: "integer", description: "Max rows, default 20" },
      },
    },
    run: async (args) => {
      const { processes } = await getDataset()
      const pid = num(args.process_id)
      return processes
        .filter((p) => pid === undefined || p.id === pid)
        .flatMap((p) => p.maintenanceLogs.map((l) => ({ process: p.name, processId: p.id, at: l.timestamp, type: l.type, status: l.status, downtimeHours: l.downtimeHours, technician: l.technician, description: l.description })))
        .filter((l) => (!args.type || l.type === args.type) && (!args.status || l.status === args.status))
        .sort((a, b) => +new Date(b.at) - +new Date(a.at))
        .slice(0, num(args.limit, 20))
    },
  },
  {
    name: "get_factory_kpis",
    label: "factory KPIs",
    source: "factory",
    description: "Factory-wide KPIs computed over the active processes.",
    parameters: empty,
    run: async () => {
      const { processes } = await getDataset()
      return getFleetKpis(processes.filter((p) => p.status === "active")).map((k) => ({ kpi: k.label, value: k.value, note: k.helper }))
    },
  },
  {
    name: "list_products",
    label: "product list",
    source: "products",
    description: "List all products with id, reference, name, status, number of routing steps and production runs.",
    parameters: empty,
    run: async () => (await getProducts()).map((p) => ({ id: p.id, reference: p.reference, name: p.name, status: p.status, steps: p.stepCount, runs: p.runCount })),
  },
  {
    name: "get_product",
    label: "product details",
    source: "products",
    description: "One product: specs, routing (steps, process, minutes per unit, dependencies) and production totals (runs, produced, scrap, yield, lead time).",
    parameters: { type: "object", properties: { product_id: productId }, required: ["product_id"] },
    run: async (args) => {
      const p = await getProduct(need(args.product_id, "product_id"))
      if (!p) throw new Error("Product not found")
      const name = (id: number) => p.steps.find((s) => s.id === id)?.name
      return {
        id: p.id, reference: p.reference, name: p.name, status: p.status, category: p.category, material: p.material, standard: p.standard, unit: p.unit,
        specs: p.specs.map((s) => `${s.name}: ${s.value}${s.unit ? ` ${s.unit}` : ""}`),
        routing: p.steps.map((s) => ({ step: s.name, process: s.processName, processId: s.processId, minutesPerUnit: s.standardDurationMinutes, after: s.dependsOnStepIds.map(name), final: s.isFinal })),
        stats: p.stats,
      }
    },
  },
  {
    name: "get_production_runs",
    label: "production runs",
    source: "products",
    description: "Past production runs of a product, newest first: batch, dates, produced, scrap, yield and lead time.",
    parameters: { type: "object", properties: { product_id: productId, limit: { type: "integer", description: "Max rows, default 10" } }, required: ["product_id"] },
    run: async (args) => {
      const runs = await getProductRuns(need(args.product_id, "product_id"))
      return runs.slice(0, num(args.limit, 10)).map((r) => ({
        batch: r.batchNumber, startedAt: r.startedAt, endedAt: r.endedAt, produced: r.quantityProduced, scrap: r.quantityScrap, yieldPct: r.yieldPct, leadTimeHours: round(r.leadTimeHours),
      }))
    },
  },
  {
    name: "get_failure_risk",
    label: "failure-risk ranking",
    source: "ai",
    description: "AI Lab failure-risk model: for every active process, the chance of a corrective intervention within 14 days, status, usual interval and next expected date. Processes with fewer than 3 corrective logs are reported as not ready.",
    parameters: empty,
    run: async () =>
      (await getMaintenanceRisk()).map((r) => ({
        process: r.process_name, processId: r.process_id, ready: r.ready, note: r.note, status: r.status, probability14d: round(r.probability_14d, 3),
        usualIntervalDays: round(r.mean_interval_days, 1), daysSinceLastCorrective: round(r.days_since_last, 1), nextExpectedAt: r.next_expected_at, overdue: r.overdue, confidence: round(r.confidence),
      })),
  },
  {
    name: "forecast_sensor",
    label: "sensor forecast",
    source: "ai",
    description: "Run the AI Lab forecast on a number sensor. Returns the chosen model, accuracy versus repeating the last value, and a summary of the predicted values with their likely range.",
    parameters: {
      type: "object",
      properties: {
        process_id: processId,
        sensor_id: { type: "integer", description: "Sensor id (see get_process); must be a number sensor" },
        history_hours: { type: "number", description: "How much history to learn from, default 24" },
        horizon_minutes: { type: "number", description: "How far ahead to predict, default 60" },
      },
      required: ["process_id", "sensor_id"],
    },
    run: async (args) => {
      const r = await runForecast({ process_id: need(args.process_id, "process_id"), sensor_id: need(args.sensor_id, "sensor_id"), history_hours: num(args.history_hours, 24)!, horizon_minutes: num(args.horizon_minutes, 60)! })
      const f = r.forecast
      const pick = [f[0], f[Math.floor(f.length / 2)], f.at(-1)!].map((p) => ({ at: p.t, value: round(p.value), likelyRange: [round(p.lower), round(p.upper)] }))
      return { sensor: r.sensor_name, model: r.model, quality: r.quality, typicalError: round(r.mae), improvementOverRepeatLastPct: round(r.improvement_pct, 0), lastMeasured: round(r.history.at(-1)?.value), forecastPoints: pick }
    },
  },
  {
    name: "detect_anomalies",
    label: "anomaly scan",
    source: "ai",
    description: "Scan all sensors of a process for unusual readings in the last N hours (ending at the newest reading). Returns per-sensor counts and the strongest events.",
    parameters: {
      type: "object",
      properties: { process_id: processId, window_hours: { type: "number", description: "Default 24" }, sensitivity: { type: "string", enum: ["low", "medium", "high"], description: "Default medium" } },
      required: ["process_id"],
    },
    run: async (args) => {
      const sensitivity = ["low", "medium", "high"].includes(String(args.sensitivity)) ? (args.sensitivity as "low" | "medium" | "high") : "medium"
      const r = await runAnomalies({ process_id: need(args.process_id, "process_id"), window_hours: num(args.window_hours, 24)!, sensitivity })
      return r.sensors.map((s) => ({
        sensor: s.name, type: s.data_type, readings: s.readings, anomalies: s.anomaly_count, skipped: s.skipped_reason,
        strongestEvents: [...s.events].sort((a, b) => b.score - a.score).slice(0, 3).map((e) => ({ at: e.start, value: round(e.peak_value), expected: round(e.expected), strength: round(e.score, 1) })),
        rareValues: s.rare_values.slice(0, 3),
      }))
    },
  },
  {
    name: "estimate_production",
    label: "production estimate",
    source: "ai",
    description: "AI Lab estimate of lead time and scrap for producing a given number of good units of a product, based on its past runs (needs 5+ runs).",
    parameters: { type: "object", properties: { product_id: productId, quantity: { type: "number", description: "Good units to produce" } }, required: ["product_id", "quantity"] },
    run: async (args) => {
      const r = await runProductionEstimate({ product_id: need(args.product_id, "product_id"), quantity: need(args.quantity, "quantity") })
      return { product: r.product_name, unit: r.unit, ready: r.ready, note: r.note, runsUsed: r.runs_used, leadTimeHours: r.lead_time, scrapPct: r.scrap_pct, rSquared: round(r.r2), hoursPerUnit: round(r.hours_per_unit, 4), setupHours: round(r.setup_hours) }
    },
  },
  {
    name: "run_simulation",
    label: "production simulation",
    source: "ai",
    description:
      "Simulate producing several products at once. Reports whether it is possible (a process that is off or inactive blocks the products that need it), how long it takes, the typical range and the bottleneck. Use switch_off_process_ids / switch_on_process_ids for what-if questions.",
    parameters: {
      type: "object",
      properties: {
        orders: { type: "array", description: "List of {product_id, quantity}", items: { type: "object", properties: { product_id: { type: "integer" }, quantity: { type: "integer" } } } },
        switch_off_process_ids: { type: "array", description: "Process ids to treat as broken/off", items: { type: "integer" } },
        switch_on_process_ids: { type: "array", description: "Process ids to treat as running even if currently inactive", items: { type: "integer" } },
        transfer_minutes: { type: "number", description: "Fixed movement time between processes, default 5" },
        variability_pct: { type: "number", description: "Random variation of step durations in %, default 10" },
        strategy: { type: "string", enum: ["optimized", "fifo", "sequence", "proportional", "spt", "lpt", "remaining"], description: "Scheduling strategy, default optimized (searches for the fastest plan)" },
      },
      required: ["orders"],
    },
    run: async (args) => {
      const orders = (Array.isArray(args.orders) ? args.orders : []).map((o: Args) => ({ product_id: need(o.product_id, "product_id"), quantity: Math.floor(need(o.quantity, "quantity")) }))
      const ids = (value: unknown) => (Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [])
      const r = await runSimulation({
        orders,
        transfer_minutes: num(args.transfer_minutes, 5)!,
        variability_pct: num(args.variability_pct, 10)!,
        replications: 20,
        capacity_mode: "single",
        strategy: (["optimized", "fifo", "sequence", "proportional", "spt", "lpt", "remaining"].includes(String(args.strategy)) ? args.strategy : "optimized") as SimStrategy,
        compare: true,
        overrides: [...ids(args.switch_off_process_ids).map((id) => ({ process_id: id, enabled: false })), ...ids(args.switch_on_process_ids).map((id) => ({ process_id: id, enabled: true }))],
      })
      const minutes = (m: number | null | undefined) => (m === null || m === undefined ? null : `${Math.round(m)} min (${(m / 60).toFixed(1)} h)`)
      return {
        possible: r.feasible,
        totalTime: minutes(r.makespan_minutes),
        withoutRandomness: minutes(r.monte_carlo?.expected),
        typicalRange: r.monte_carlo && r.monte_carlo.runs > 1 ? `${minutes(r.monte_carlo.p50)} to ${minutes(r.monte_carlo.p90)}` : null,
        orders: r.orders.map((o) => ({ product: o.reference, quantity: o.quantity, simulated: o.simulated, finishes: minutes(o.finish_minutes), singleUnitTime: minutes(o.unit_lead_time_minutes), blockedBy: o.blockers.map((b) => `${b.process_name} is ${b.reason} (needed for ${b.steps.join(", ")})`) })),
        processes: r.processes.map((p) => ({ id: p.id, name: p.name, instances: p.instances, busyPct: round(p.utilization_pct, 0), avgWaitMinutes: round(p.avg_wait_minutes, 1) })),
        bottleneck: r.processes.find((p) => p.id === r.bottleneck_process_id)?.name ?? null,
        strategyUsed: r.strategy_label,
        quality: r.metrics && {
          efficiencyPct: round(r.metrics.efficiency_pct, 1), machineLoadPct: round(r.metrics.avg_utilization_pct, 1), outputPerHour: round(r.metrics.throughput_per_hour, 1),
          avgWaitMinutes: round(r.metrics.avg_wait_minutes, 1), theoreticalMinimum: minutes(r.metrics.lower_bound_minutes),
        },
        strategySearch: r.optimization && { fasterThanFirstComeFirstServedPct: round(r.optimization.improvement_pct, 1), alternativesTried: r.optimization.iterations },
        strategyComparison: r.comparison.map((c) => ({ strategy: c.label, totalTime: minutes(c.metrics.makespan_minutes), machineLoadPct: round(c.metrics.avg_utilization_pct, 1), avgWaitMinutes: round(c.metrics.avg_wait_minutes, 1) })),
        capacityAdvice: r.advice.map((a) => `One more ${a.process_name} would finish ${a.saving_pct.toFixed(0)}% sooner (${minutes(a.makespan_minutes)})`),
        warnings: r.warnings,
        assumptions: "24/7 operation, one unit per process instance at a time, fixed movement time between different processes",
      }
    },
  },
]

/** Compact snapshot so the model knows what exists before it calls any tool. */
export async function getSnapshot(sources: Set<SourceId>) {
  const lines: string[] = []
  if (sources.has("factory")) {
    const { processes, departments } = await getDataset()
    lines.push(`Departments (${departments.length}): ${departments.map((d) => d.name).join(", ") || "none"}`)
    lines.push(`Processes (${processes.length}): ${processes.map((p) => `[${p.id}] ${p.name} (${p.type}, ${p.status})`).join("; ") || "none"}`)
  }
  if (sources.has("products")) {
    const products = await getProducts()
    lines.push(`Products (${products.length}): ${products.map((p) => `[${p.id}] ${p.reference} ${p.name} (${p.status}, ${p.runCount} runs)`).join("; ") || "none"}`)
  }
  if (sources.has("ai")) {
    const { processes } = await getAiCatalog()
    const withData = processes.filter((p) => p.sensors.some((s) => s.reading_count > 0))
    lines.push(`Processes with collected sensor readings: ${withData.map((p) => p.name).join(", ") || "none yet"}`)
  }
  return lines.join("\n")
}

export function toolsFor(sources: Set<SourceId>) {
  return TOOLS.filter((tool) => sources.has(tool.source))
}
