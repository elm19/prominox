export type ProcessStatus = "active" | "inactive"

export type ProcessType = "manual" | "machine"

export type SensorDataType = "text" | "number" | "boolean"

export type ReadingValue = number | string | boolean

export type MaintenanceStatus = "solved" | "pending" | "in_progress"

export type MaintenanceType =
  | "inspection"
  | "preventive"
  | "corrective"
  | "calibration"
  | "lubrication"

export type PredictionStatus = "healthy" | "observe" | "service_soon"

export type SensorDefinition = {
  id: number
  /** Key of this sensor in SensorReading.values (the sensor id as a string) */
  key: string
  name: string
  dataType: SensorDataType
  description: string | null
}

export type SensorReading = {
  timestamp: string
  values: Record<string, ReadingValue>
}

export type ProcessImage = {
  id: number
  filename: string
  url: string
  sizeBytes: number
}

export type MaintenanceLog = {
  id: number
  processId: number
  timestamp: string
  type: MaintenanceType
  description: string
  status: MaintenanceStatus
  downtimeHours: number
  technician: string
}

export type PredictionPanelState = {
  result: string
  remainingUsefulLifeHours: number | null
  nextMaintenanceDate: string | null
  confidence: number
  lastPredictionDate: string
  status: PredictionStatus
}

export type Department = {
  id: number
  name: string
  description: string | null
  positionX: number | null
  positionY: number | null
  processCount: number
}

export type Process = {
  id: number
  name: string
  code: string
  type: ProcessType
  departmentId: number
  department: Department | null
  /** 0 means dynamic (no fixed limit) */
  capacity: number
  /** Instances of this process that can run in parallel */
  quantity: number
  status: ProcessStatus
  images: ProcessImage[]
  description: string
  positionX: number | null
  positionY: number | null
  sensors: SensorDefinition[]
  sensorData: SensorReading[]
  lastUpdate: string | null
  scheduledHours30d: number
  maintenanceLogs: MaintenanceLog[]
  latestPrediction: PredictionPanelState | null
  /** RRT: the machine receives live data from Node-RED */
  rrtEnabled: boolean
  rrtLastReceivedAt: string | null
}

export type DashboardStat = {
  label: string
  value: string
  helper: string
  helpHref?: string
  fallbackLabel?: string
}

export type KpiSlug =
  | "availability"
  | "mtbf"
  | "mttr"
  | "downtime-hours"
  | "planned-maintenance-ratio"
  | "failure-rate"
  | "telemetry-coverage"

export type KpiDefinition = {
  slug: KpiSlug
  label: string
  shortDescription: string
  whyItMatters: string
  formula: string
  operatorInputs: string[]
  fallbackBehavior: string
  interpretation: string[]
}

// --- Products ---
export type ProductStatus = "active" | "archived"

export type ProductSpec = { id: number; name: string; value: string; unit: string | null }

export type ProductFile = {
  id: number
  kind: "image" | "pdf"
  filename: string
  url: string
  sizeBytes: number
}

export type ProductStep = {
  id: number
  processId: number
  processName: string
  name: string
  sequence: number
  description: string | null
  standardDurationMinutes: number | null
  dependsOnStepIds: number[]
  /** Last step of the cycle: the product is finished here */
  isFinal: boolean
}

export type ProductStats = {
  runCount: number
  totalProduced: number
  totalScrap: number
  yieldPct: number | null
  avgLeadTimeHours: number | null
  lastRunAt: string | null
}

export type ProductSummary = {
  id: number
  reference: string
  name: string
  category: string | null
  status: ProductStatus
  color: string
  unit: string
  revision: string
  stepCount: number
  processCount: number
  runCount: number
  thumbnailUrl: string | null
}

export type Product = ProductSummary & {
  description: string | null
  material: string | null
  standard: string | null
  createdAt: string
  updatedAt: string
  specs: ProductSpec[]
  files: ProductFile[]
  steps: ProductStep[]
  stats: ProductStats
}

export type RunStep = {
  id: number
  productStepId: number | null
  stepName: string
  processId: number
  processName: string
  processCode: string | null
  instance: number | null
  startedAt: string
  endedAt: string
  durationMinutes: number
  quantityIn: number
  quantityOut: number
  quantityScrap: number
  operator: string | null
  notes: string | null
}

export type ProductionRun = {
  id: number
  productId: number
  batchNumber: string
  customerOrder: string | null
  startedAt: string
  endedAt: string
  leadTimeHours: number
  quantityProduced: number
  quantityScrap: number
  yieldPct: number | null
  stepCount: number
  notes: string | null
  steps: RunStep[]
}

export type ProductFlow = {
  productId: number
  reference: string
  name: string
  color: string
  processIds: number[]
  /** Processes where the product's cycle ends */
  finalProcessIds: number[]
  edges: { fromStepId: number; toStepId: number; sourceProcessId: number; targetProcessId: number }[]
}
