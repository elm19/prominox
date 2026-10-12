import { getKpiHelpHref } from "@/lib/kpi-definitions"
import type { DashboardStat, Process, MaintenanceLog } from "@/lib/types"

const DEFAULT_SCHEDULED_HOURS_30D = 720
const PLANNED_MAINTENANCE_TYPES = new Set<MaintenanceLog["type"]>([
  "inspection",
  "preventive",
  "calibration",
  "lubrication",
])

function hoursBetween(start: string, end: string) {
  return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60)
}

function getFailureLikeLogs(logs: MaintenanceLog[]) {
  return logs.filter((log) => log.type === "corrective" || log.status === "in_progress")
}

function getPlannedLogs(logs: MaintenanceLog[]) {
  return logs.filter((log) => PLANNED_MAINTENANCE_TYPES.has(log.type))
}

function getScheduledHours(process: Process) {
  const value = Number(process.scheduledHours30d ?? 0)

  if (value > 0) {
    return { value, usedFallback: false }
  }

  return { value: DEFAULT_SCHEDULED_HOURS_30D, usedFallback: true }
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function formatHours(value: number, precision = 1) {
  return `${value.toFixed(precision)} h`
}

function createKpiStat(
  label: DashboardStat["label"],
  value: DashboardStat["value"],
  helper: DashboardStat["helper"],
  helpSlug: Parameters<typeof getKpiHelpHref>[0],
  fallbackLabel?: string
): DashboardStat {
  return {
    label,
    value,
    helper,
    helpHref: getKpiHelpHref(helpSlug),
    fallbackLabel,
  }
}

export function getDowntimeHours(process: Process) {
  return process.maintenanceLogs.reduce((sum, log) => sum + Number(log.downtimeHours || 0), 0)
}

export function getAvailability(process: Process) {
  const scheduled = getScheduledHours(process)
  const runtime = Math.max(scheduled.value - getDowntimeHours(process), 0)

  return {
    value: (runtime / scheduled.value) * 100,
    usedFallback: scheduled.usedFallback,
  }
}

export function getMTBF(process: Process) {
  const failures = getFailureLikeLogs(process.maintenanceLogs).length
  const scheduled = getScheduledHours(process)
  const runtime = Math.max(scheduled.value - getDowntimeHours(process), 0)

  if (failures === 0) {
    return {
      value: runtime,
      usedFallback: scheduled.usedFallback,
    }
  }

  return {
    value: runtime / failures,
    usedFallback: scheduled.usedFallback,
  }
}

export function getMTTR(process: Process) {
  const failures = getFailureLikeLogs(process.maintenanceLogs).length

  if (failures === 0) {
    return { value: 0, usedFallback: false }
  }

  return {
    value: getDowntimeHours(process) / failures,
    usedFallback: false,
  }
}

export function getMaintenanceCount(process: Process) {
  return process.maintenanceLogs.length
}

export function getPlannedMaintenanceRatio(process: Process) {
  const total = process.maintenanceLogs.length

  if (!total) {
    return { value: 0, usedFallback: false }
  }

  return {
    value: (getPlannedLogs(process.maintenanceLogs).length / total) * 100,
    usedFallback: false,
  }
}

export function getFailureRate(process: Process) {
  const failures = getFailureLikeLogs(process.maintenanceLogs).length
  const scheduled = getScheduledHours(process)
  const runtime = Math.max(scheduled.value - getDowntimeHours(process), 0)

  if (runtime <= 0) {
    return {
      value: 0,
      usedFallback: scheduled.usedFallback,
    }
  }

  return {
    value: (failures / runtime) * 100,
    usedFallback: scheduled.usedFallback,
  }
}

export function getTelemetryCoverage(process: Process) {
  const totalSensors = process.sensors.length

  if (!totalSensors) {
    return { value: 0, usedFallback: false }
  }

  const sensorsWithData = new Set(
    process.sensorData.flatMap((reading) =>
      Object.entries(reading.values)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key]) => key)
    )
  )

  return {
    value: (sensorsWithData.size / totalSensors) * 100,
    usedFallback: false,
  }
}

export function getDashboardStats(processes: Process[]): DashboardStat[] {
  const activeProcesses = processes.filter((process) => process.status === "active").length
  const withData = processes.filter((process) => process.sensorData.length > 0).length
  const withoutSensors = processes.filter((process) => process.sensors.length === 0).length

  return [
    {
      label: "Processes",
      value: processes.length.toString(),
      helper: `${activeProcesses} active on the factory floor`,
    },
    {
      label: "With sensor data",
      value: withData.toString(),
      helper: `${processes.length - withData} waiting for telemetry onboarding`,
    },
    {
      label: "Without sensors",
      value: withoutSensors.toString(),
      helper: "Processes with no sensor configured for data collection",
    },
    {
      label: "Recent maintenance logs",
      value: processes.reduce((sum, process) => sum + process.maintenanceLogs.length, 0).toString(),
      helper: "Captured across the factory",
    },
  ]
}

export function getFleetKpis(processes: Process[]) {
  const divisor = Math.max(processes.length, 1)
  const availabilityValues = processes.map(getAvailability)
  const mtbfValues = processes.map(getMTBF)
  const mttrValues = processes.map(getMTTR)
  const plannedRatioValues = processes.map(getPlannedMaintenanceRatio)
  const failureRateValues = processes.map(getFailureRate)
  const telemetryCoverageValues = processes.map(getTelemetryCoverage)
  const downtime = processes.reduce((sum, process) => sum + getDowntimeHours(process), 0)

  const availability = availabilityValues.reduce((sum, item) => sum + item.value, 0) / divisor
  const mtbf = mtbfValues.reduce((sum, item) => sum + item.value, 0) / divisor
  const mttr = mttrValues.reduce((sum, item) => sum + item.value, 0) / divisor
  const plannedRatio = plannedRatioValues.reduce((sum, item) => sum + item.value, 0) / divisor
  const failureRate = failureRateValues.reduce((sum, item) => sum + item.value, 0) / divisor
  const telemetryCoverage = telemetryCoverageValues.reduce((sum, item) => sum + item.value, 0) / divisor
  const usedScheduleFallback =
    availabilityValues.some((item) => item.usedFallback) ||
    mtbfValues.some((item) => item.usedFallback) ||
    failureRateValues.some((item) => item.usedFallback)

  return [
    createKpiStat(
      "Availability",
      formatPercent(availability),
      "30-day average of planned runtime kept online",
      "availability",
      usedScheduleFallback ? "Includes default 30-day schedule where hours were missing" : undefined
    ),
    createKpiStat(
      "MTBF",
      formatHours(mtbf, 0),
      "Mean runtime between failure-like events",
      "mtbf",
      usedScheduleFallback ? "Uses default 30-day schedule for assets missing planned hours" : undefined
    ),
    createKpiStat("MTTR", formatHours(mttr), "Average time to restore equipment", "mttr"),
    createKpiStat("Downtime", formatHours(downtime), "Combined logged downtime across the fleet", "downtime-hours"),
    createKpiStat(
      "Planned ratio",
      formatPercent(plannedRatio),
      "Share of logged work that was planned instead of reactive",
      "planned-maintenance-ratio"
    ),
    createKpiStat(
      "Failure rate",
      `${failureRate.toFixed(2)} / 100h`,
      "Failure-like events normalized per 100 runtime hours",
      "failure-rate",
      usedScheduleFallback ? "Uses default runtime window where planned hours were missing" : undefined
    ),
    createKpiStat(
      "Telemetry coverage",
      formatPercent(telemetryCoverage),
      "Average share of configured sensors already feeding data",
      "telemetry-coverage"
    ),
  ]
}

export function getProcessKpis(process: Process) {
  const availability = getAvailability(process)
  const mtbf = getMTBF(process)
  const mttr = getMTTR(process)
  const plannedRatio = getPlannedMaintenanceRatio(process)
  const failureRate = getFailureRate(process)
  const telemetryCoverage = getTelemetryCoverage(process)

  return [
    createKpiStat(
      "Availability",
      formatPercent(availability.value),
      "Scheduled runtime kept online in the current window",
      "availability",
      availability.usedFallback ? "Using the default 30-day schedule until planned hours are entered" : undefined
    ),
    createKpiStat(
      "MTBF",
      formatHours(mtbf.value, 0),
      "Derived from runtime and failure-like maintenance events",
      "mtbf",
      mtbf.usedFallback ? "Using the default 30-day schedule until planned hours are entered" : undefined
    ),
    createKpiStat("MTTR", formatHours(mttr.value), "Average repair duration from logged downtime", "mttr"),
    createKpiStat("Downtime", formatHours(getDowntimeHours(process)), "Total logged downtime in the current window", "downtime-hours"),
    createKpiStat(
      "Planned ratio",
      formatPercent(plannedRatio.value),
      "How much recorded work was preventive, inspection, calibration, or lubrication",
      "planned-maintenance-ratio"
    ),
    createKpiStat(
      "Failure rate",
      `${failureRate.value.toFixed(2)} / 100h`,
      "Failure-like events normalized by runtime",
      "failure-rate",
      failureRate.usedFallback ? "Using the default runtime window until planned hours are entered" : undefined
    ),
    createKpiStat(
      "Telemetry coverage",
      formatPercent(telemetryCoverage.value),
      "Configured sensors that already have at least one telemetry reading",
      "telemetry-coverage"
    ),
  ]
}

export function getRelativeUpdate(lastUpdate: string | null) {
  if (!lastUpdate) return "No data yet"
  const now = new Date().toISOString()
  const diff = hoursBetween(lastUpdate, now)
  if (diff < 1) return "Updated within the last hour"
  if (diff < 24) return `Updated ${Math.round(diff)}h ago`
  return `Updated ${Math.round(diff / 24)}d ago`
}
