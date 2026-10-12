import type { KpiDefinition, KpiSlug } from "@/lib/types"

export const KPI_HELP_PATH = "/help/kpis"

export const KPI_DEFINITIONS: KpiDefinition[] = [
  {
    slug: "availability",
    label: "Availability",
    shortDescription: "The share of planned production time that the process stayed available for operation.",
    whyItMatters: "Availability gives operators a fast view of uptime discipline and the operational impact of breakdowns.",
    formula: "Availability (%) = ((scheduled hours - downtime hours) / scheduled hours) * 100",
    operatorInputs: [
      "Scheduled operating hours for the KPI window, such as the last 30 days",
      "Downtime duration on maintenance logs or stoppage records",
      "Consistent maintenance timestamps so downtime can be trusted",
    ],
    fallbackBehavior: "If scheduled hours are missing, the app assumes a 720-hour 30-day window so the KPI can still render.",
    interpretation: [
      "Higher is generally better because more of the planned window stayed online.",
      "A drop usually points to frequent stoppages or one long outage.",
    ],
  },
  {
    slug: "mtbf",
    label: "MTBF",
    shortDescription: "Mean Time Between Failures estimates how many runtime hours pass before the next failure-like event.",
    whyItMatters: "It helps maintenance teams judge reliability and whether interventions are extending healthy runtime.",
    formula: "MTBF (hours) = runtime hours / failure event count",
    operatorInputs: [
      "Scheduled operating hours for the window",
      "Downtime hours to derive runtime hours",
      "Failure events, typically corrective jobs or unresolved incidents",
    ],
    fallbackBehavior: "If scheduled hours are missing, the app uses 720 hours. If no failures are logged, MTBF falls back to the runtime window itself.",
    interpretation: [
      "Higher is better because failures are spaced further apart.",
      "A low MTBF often means the process needs root-cause work rather than repeated quick fixes.",
    ],
  },
  {
    slug: "mttr",
    label: "MTTR",
    shortDescription: "Mean Time To Repair tracks how long it takes on average to restore equipment after a failure-like event.",
    whyItMatters: "It shows how efficient the repair process is, from diagnosis to return to service.",
    formula: "MTTR (hours) = total repair downtime / failure event count",
    operatorInputs: [
      "Downtime hours for each failure or corrective job",
      "Failure event count for the same time window",
      "Consistent maintenance status updates so completed work is distinguishable from open work",
    ],
    fallbackBehavior: "If no failure events are logged, the app shows 0 hours instead of inventing repair time.",
    interpretation: [
      "Lower is better because equipment is restored faster.",
      "A rising MTTR can signal spare-part delays, poor troubleshooting data, or resourcing gaps.",
    ],
  },
  {
    slug: "downtime-hours",
    label: "Downtime",
    shortDescription: "Downtime hours sum the logged time a process was unavailable due to maintenance or faults.",
    whyItMatters: "This KPI is the most direct measure of lost production time and heavily influences availability.",
    formula: "Downtime hours = sum of downtime hours from maintenance logs in the KPI window",
    operatorInputs: [
      "Downtime duration for each intervention or stop event",
      "Maintenance timestamps to keep the window accurate",
      "Clear logging of which jobs actually stopped production",
    ],
    fallbackBehavior: "If downtime is missing on a log, that record contributes 0 hours until the operator fills it in.",
    interpretation: [
      "Lower is usually better, especially for critical assets.",
      "A stable downtime total with rising maintenance count may indicate faster, smaller interventions.",
    ],
  },
  {
    slug: "planned-maintenance-ratio",
    label: "Planned ratio",
    shortDescription: "The percentage of maintenance work that was planned instead of reactive.",
    whyItMatters: "Mature maintenance programs aim to shift work from reactive breakdowns toward planned preventive actions.",
    formula: "Planned maintenance ratio (%) = planned maintenance logs / total maintenance logs * 100",
    operatorInputs: [
      "Maintenance type classification, especially preventive, inspection, calibration, lubrication, and corrective",
      "Complete maintenance logging for the window",
      "A consistent rule for what counts as planned work",
    ],
    fallbackBehavior: "If there are no maintenance logs, the app shows 0% until work history exists.",
    interpretation: [
      "Higher is usually healthier because more work is controlled and scheduled.",
      "A sudden drop often means the team is spending more effort on breakdown response.",
    ],
  },
  {
    slug: "failure-rate",
    label: "Failure rate",
    shortDescription: "Failure rate shows how often failure-like events occur relative to runtime.",
    whyItMatters: "It normalizes breakdown frequency so operators can compare processes with different workloads.",
    formula: "Failure rate = failure events / runtime hours * 100",
    operatorInputs: [
      "Failure event count, usually corrective or open incident logs",
      "Runtime hours for the same period",
      "Downtime and scheduled hours so runtime can be derived cleanly",
    ],
    fallbackBehavior: "If scheduled hours are missing, the app uses 720 hours. If runtime is 0, the app reports 0 events per 100 hours.",
    interpretation: [
      "Lower is better because faults are happening less often.",
      "A process with high failure rate and high MTTR is usually the first reliability priority.",
    ],
  },
  {
    slug: "telemetry-coverage",
    label: "Telemetry coverage",
    shortDescription: "Telemetry coverage measures how many configured sensors are actually feeding data.",
    whyItMatters: "Predictive maintenance quality depends on healthy sensor coverage, not just model configuration.",
    formula: "Telemetry coverage (%) = sensors with at least one reading / configured sensors * 100",
    operatorInputs: [
      "Configured sensor list for the process",
      "At least one reading per sensor in the selected data window",
      "Accurate sensor mapping between the asset and incoming telemetry",
    ],
    fallbackBehavior: "If a process has no configured sensors, the app shows 0% coverage instead of guessing.",
    interpretation: [
      "Higher is better because the process is better instrumented for monitoring and prediction.",
      "Low coverage often means integration work is still incomplete, even if the model exists.",
    ],
  },
]

export function getKpiDefinition(slug: KpiSlug) {
  return KPI_DEFINITIONS.find((definition) => definition.slug === slug)
}

export function getKpiHelpHref(slug: KpiSlug) {
  return `${KPI_HELP_PATH}/${slug}`
}
