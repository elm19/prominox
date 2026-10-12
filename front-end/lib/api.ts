import type {
  Department,
  Product,
  ProductFlow,
  ProductFile,
  ProductionRun,
  ProductStatus,
  ProductSummary,
  RunStep,
  ProcessType,
  PredictionStatus,
  SensorDataType,
  MaintenanceLog,
  MaintenanceStatus,
  MaintenanceType,
  PredictionPanelState,
  Process,
  ProcessStatus,
  SensorDefinition,
  SensorReading,
} from "@/lib/types"

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const API_BASE = `${API_URL}/api/v1`

// --- Raw API shapes (snake_case, as returned by FastAPI) ---
type DepartmentApi = {
  id: number
  name: string
  description: string | null
  position_x: number | null
  position_y: number | null
  process_count: number
}
type SensorApi = { id: number; process_id: number; name: string; data_type: SensorDataType; description: string | null }
type ImageApi = { id: number; process_id: number; filename: string; url: string; size_bytes: number }
type LogApi = {
  id: number
  process_id: number
  performed_at: string
  type: MaintenanceType
  description: string
  status: MaintenanceStatus
  downtime_hours: number
  technician: string | null
}
type SnapshotApi = {
  result: string
  remaining_useful_life_hours: number | null
  next_maintenance_date: string | null
  confidence: number
  last_prediction_date: string
  status: PredictionPanelState["status"]
}
export type ProcessApi = {
  id: number
  name: string
  code: string | null
  type: ProcessType
  description: string | null
  capacity: number
  quantity: number
  status: ProcessStatus
  department_id: number
  position_x: number | null
  position_y: number | null
  last_update: string | null
  scheduled_hours_30d: number
  rrt_enabled: boolean
  rrt_last_received_at: string | null
  department?: DepartmentApi | null
  sensors?: SensorApi[]
  sensor_data?: SensorReading[]
  images?: ImageApi[]
  maintenance_logs?: LogApi[]
  latest_prediction?: SnapshotApi | null
}
type DashboardApi = { processes: ProcessApi[]; departments: DepartmentApi[]; recent_maintenance: LogApi[] }

// --- Mappers to the camelCase view types used by components ---
export function toLog(log: LogApi): MaintenanceLog {
  return {
    id: log.id,
    processId: log.process_id,
    timestamp: log.performed_at,
    type: log.type,
    description: log.description,
    status: log.status,
    downtimeHours: Number(log.downtime_hours),
    technician: log.technician ?? "Not assigned",
  }
}

export function toDepartment(row: DepartmentApi): Department {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    positionX: row.position_x,
    positionY: row.position_y,
    processCount: row.process_count,
  }
}

export function toSensor(sensor: SensorApi): SensorDefinition {
  return { id: sensor.id, key: String(sensor.id), name: sensor.name, dataType: sensor.data_type, description: sensor.description }
}

export function toProcess(row: ProcessApi): Process {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? `PRC-${row.id}`,
    type: row.type,
    departmentId: row.department_id,
    department: row.department ? toDepartment(row.department) : null,
    capacity: row.capacity,
    quantity: row.quantity,
    status: row.status,
    images: (row.images ?? []).map((image) => ({
      id: image.id,
      filename: image.filename,
      url: `${API_URL}${image.url}`,
      sizeBytes: image.size_bytes,
    })),
    description: row.description ?? "",
    positionX: row.position_x,
    positionY: row.position_y,
    sensors: (row.sensors ?? []).map(toSensor),
    sensorData: row.sensor_data ?? [],
    rrtEnabled: row.rrt_enabled,
    rrtLastReceivedAt: row.rrt_last_received_at,
    lastUpdate: row.last_update,
    scheduledHours30d: Number(row.scheduled_hours_30d ?? 0),
    maintenanceLogs: (row.maintenance_logs ?? []).map(toLog),
    latestPrediction: row.latest_prediction
      ? {
          result: row.latest_prediction.result,
          remainingUsefulLifeHours: row.latest_prediction.remaining_useful_life_hours,
          nextMaintenanceDate: row.latest_prediction.next_maintenance_date,
          confidence: Number(row.latest_prediction.confidence),
          lastPredictionDate: row.latest_prediction.last_prediction_date,
          status: row.latest_prediction.status,
        }
      : null,
  }
}

// --- Fetch helper ---
export type ReadingIssue = {
  row?: number | null
  sensor_id?: string
  sensor_name?: string | null
  field?: string
  message: string
  value?: unknown
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public issues: ReadingIssue[] = []) {
    super(message)
  }
}

function errorMessage(body: unknown, status: number) {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) return detail.map((d: { loc?: unknown[]; msg?: string }) => `${d.loc?.slice(1).join(".")}: ${d.msg}`).join("; ")
  return `Request failed (${status})`
}

// --- Session handling ---
// The session lives in an httpOnly cookie set by the API. Browsers send it with `credentials: "include"`;
// server components have no browser, so they forward the incoming request's cookies by hand.
async function authInit(init?: RequestInit): Promise<RequestInit> {
  if (typeof window !== "undefined") return { ...init, credentials: "include" }
  const { cookies } = await import("next/headers")
  return { ...init, headers: { ...init?.headers, Cookie: (await cookies()).toString() } }
}

export const PASSWORD_CHANGE_REQUIRED = "password_change_required"

async function leaveToLogin(reason: "expired" | "password"): Promise<never> {
  const target = reason === "password" ? "/auth/change-password" : "/auth/login"
  if (typeof window !== "undefined") {
    window.location.assign(target)
    return new Promise<never>(() => {}) // the page is navigating away
  }
  const { redirect } = await import("next/navigation")
  return redirect(target)
}

/** Sends the user to the login page when the session is gone (401), or to the forced password change (403). */
async function handleAuthFailure(response: Response, body: unknown, path: string) {
  if (path.startsWith("/auth/login")) return // wrong credentials are reported by the login form itself
  if (response.status === 401) await leaveToLogin("expired")
  if (response.status === 403 && (body as { detail?: unknown } | null)?.detail === PASSWORD_CHANGE_REQUIRED) {
    await leaveToLogin("password")
  }
}

async function request<T>(path: string, init?: RequestInit, opts: { silentAuth?: boolean } = {}): Promise<T> {
  let response: Response
  try {
    const withAuth = await authInit(init)
    response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      ...withAuth,
      headers: { "Content-Type": "application/json", ...withAuth.headers },
    })
  } catch {
    throw new ApiError("Cannot reach the Prominox API. Is the back-end running?", 0)
  }
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (!opts.silentAuth) await handleAuthFailure(response, body, path)
    const issues = (body as { errors?: ReadingIssue[] } | null)?.errors ?? []
    throw new ApiError(errorMessage(body, response.status), response.status, issues)
  }
  return body as T
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) })
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) })

// --- Dataset ---
export type AppDataset = {
  processes: Process[]
  departments: Department[]
  recentMaintenance: MaintenanceLog[]
}

export async function getDataset(): Promise<AppDataset> {
  const data = await request<DashboardApi>("/dashboard")
  return {
    processes: data.processes.map(toProcess),
    departments: data.departments.map(toDepartment),
    recentMaintenance: data.recent_maintenance.map(toLog),
  }
}

export const getDepartments = async () => (await request<DepartmentApi[]>("/departments")).map(toDepartment)

export async function getProcess(processId: number): Promise<Process | null> {
  try {
    return toProcess(await request<ProcessApi>(`/processes?process_id=${processId}`))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function getMaintenanceLog(logId: number): Promise<MaintenanceLog | null> {
  try {
    return toLog(await request<LogApi>(`/maintenance-logs?log_id=${logId}`))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

// --- Writes ---
export type ProcessInput = {
  name: string
  code?: string | null
  type: ProcessType
  department_id: number
  capacity: number
  quantity: number
  description?: string | null
  status: ProcessStatus
}

export const createProcess = (input: ProcessInput) => post<ProcessApi>("/processes", input)
export const updateProcess = (id: number, input: Partial<ProcessInput>) => patch<ProcessApi>(`/processes/${id}`, input)
export const deleteProcess = (id: number) => request<void>(`/processes/${id}`, { method: "DELETE" })

export const saveMapLayout = (layout: {
  departments: { id: number; position_x: number; position_y: number }[]
  processes: { id: number; position_x: number; position_y: number }[]
}) => patch<void>("/map/layout", layout)

export const createDepartment = async (input: { name: string; description?: string | null }) =>
  toDepartment(await post<DepartmentApi>("/departments", input))
export const updateDepartment = async (id: number, input: { name?: string; description?: string | null }) =>
  toDepartment(await patch<DepartmentApi>(`/departments/${id}`, input))
export const deleteDepartment = (id: number) => request<void>(`/departments/${id}`, { method: "DELETE" })

export type SensorInput = { name: string; data_type: SensorDataType; description?: string | null }
export const createSensor = async (processId: number, input: SensorInput) =>
  toSensor(await post<SensorApi>(`/processes/${processId}/sensors`, input))
export const updateSensor = async (processId: number, sensorId: number, input: { name?: string; description?: string | null }) =>
  toSensor(await patch<SensorApi>(`/processes/${processId}/sensors/${sensorId}`, input))
export const deleteSensor = (processId: number, sensorId: number) =>
  request<void>(`/processes/${processId}/sensors/${sensorId}`, { method: "DELETE" })

// Images are sent as multipart, so no JSON Content-Type header
export async function uploadProcessImages(processId: number, files: File[]) {
  const form = new FormData()
  files.forEach((file) => form.append("files", file))
  let response: Response
  try {
    response = await fetch(`${API_BASE}/processes/${processId}/images`, { method: "POST", body: form, credentials: "include" })
  } catch {
    throw new ApiError("Cannot reach the Prominox API. Is the back-end running?", 0)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    await handleAuthFailure(response, body, "")
    throw new ApiError(errorMessage(body, response.status), response.status)
  }
}
export const deleteProcessImage = (processId: number, imageId: number) =>
  request<void>(`/processes/${processId}/images/${imageId}`, { method: "DELETE" })

export const addReadings = (processId: number, readings: SensorReading[]) =>
  post<{ inserted: number }>(`/processes/${processId}/readings`, { readings })

export type NewLogInput = {
  process_id: number
  performed_at: string
  type: MaintenanceType
  description: string
  status: MaintenanceStatus
  downtime_hours: number
  technician?: string
}
export const createMaintenanceLog = (input: NewLogInput) => post<LogApi>("/maintenance-logs", input)

// --- CSV exports (plain links, the browser downloads them) ---
export const exportUrl = {
  readings: (opts: { processId?: number; format?: "long" | "wide" } = {}) => {
    const params = new URLSearchParams()
    if (opts.processId !== undefined) params.set("process_id", String(opts.processId))
    if (opts.format) params.set("format", opts.format)
    const query = params.toString()
    return `${API_BASE}/exports/readings.csv${query ? `?${query}` : ""}`
  },
  maintenanceLogs: (processId?: number) =>
    `${API_BASE}/exports/maintenance-logs.csv${processId !== undefined ? `?process_id=${processId}` : ""}`,
  processes: () => `${API_BASE}/exports/processes.csv`,
}

// =====================================================================
// Products
// =====================================================================
type ProductSummaryApi = {
  id: number
  reference: string
  name: string
  category: string | null
  status: ProductStatus
  color: string
  unit: string
  revision: string
  step_count: number
  process_count: number
  run_count: number
  thumbnail_url: string | null
}
type ProductFileApi = { id: number; kind: "image" | "pdf"; filename: string; url: string; size_bytes: number }
type StepApi = {
  id: number
  process_id: number
  process_name: string
  name: string
  sequence: number
  description: string | null
  standard_duration_minutes: number | null
  depends_on_step_ids: number[]
  is_final: boolean
}
type ProductApi = ProductSummaryApi & {
  description: string | null
  material: string | null
  standard: string | null
  created_at: string
  updated_at: string
  specs: { id: number; name: string; value: string; unit: string | null }[]
  files: ProductFileApi[]
  steps: StepApi[]
  stats: {
    run_count: number
    total_produced: number
    total_scrap: number
    yield_pct: number | null
    avg_lead_time_hours: number | null
    last_run_at: string | null
  }
}
type RunStepApi = {
  id: number
  product_step_id: number | null
  step_name: string
  process_id: number
  process_name: string
  process_code: string | null
  instance: number | null
  started_at: string
  ended_at: string
  duration_minutes: number
  quantity_in: number
  quantity_out: number
  quantity_scrap: number
  operator: string | null
  notes: string | null
}
type RunApi = {
  id: number
  product_id: number
  batch_number: string
  customer_order: string | null
  started_at: string
  ended_at: string
  lead_time_hours: number
  quantity_produced: number
  quantity_scrap: number
  yield_pct: number | null
  step_count: number
  notes?: string | null
  steps?: RunStepApi[]
}
type FlowApi = {
  product_id: number
  reference: string
  name: string
  color: string
  process_ids: number[]
  final_process_ids: number[]
  edges: { from_step_id: number; to_step_id: number; source_process_id: number; target_process_id: number }[]
}

const toFile = (file: ProductFileApi): ProductFile => ({
  id: file.id,
  kind: file.kind,
  filename: file.filename,
  url: `${API_URL}${file.url}`,
  sizeBytes: file.size_bytes,
})

const toProductSummary = (row: ProductSummaryApi): ProductSummary => ({
  id: row.id,
  reference: row.reference,
  name: row.name,
  category: row.category,
  status: row.status,
  color: row.color,
  unit: row.unit,
  revision: row.revision,
  stepCount: row.step_count,
  processCount: row.process_count,
  runCount: row.run_count,
  thumbnailUrl: row.thumbnail_url ? `${API_URL}${row.thumbnail_url}` : null,
})

export const toProduct = (row: ProductApi): Product => ({
  ...toProductSummary(row),
  description: row.description,
  material: row.material,
  standard: row.standard,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  specs: row.specs,
  files: row.files.map(toFile),
  steps: row.steps.map((step) => ({
    id: step.id,
    processId: step.process_id,
    processName: step.process_name,
    name: step.name,
    sequence: step.sequence,
    description: step.description,
    standardDurationMinutes: step.standard_duration_minutes,
    dependsOnStepIds: step.depends_on_step_ids,
    isFinal: step.is_final,
  })),
  stats: {
    runCount: row.stats.run_count,
    totalProduced: row.stats.total_produced,
    totalScrap: row.stats.total_scrap,
    yieldPct: row.stats.yield_pct,
    avgLeadTimeHours: row.stats.avg_lead_time_hours,
    lastRunAt: row.stats.last_run_at,
  },
})

const toRunStep = (step: RunStepApi): RunStep => ({
  id: step.id,
  productStepId: step.product_step_id,
  stepName: step.step_name,
  processId: step.process_id,
  processName: step.process_name,
  processCode: step.process_code,
  instance: step.instance,
  startedAt: step.started_at,
  endedAt: step.ended_at,
  durationMinutes: step.duration_minutes,
  quantityIn: step.quantity_in,
  quantityOut: step.quantity_out,
  quantityScrap: step.quantity_scrap,
  operator: step.operator,
  notes: step.notes,
})

const toRun = (row: RunApi): ProductionRun => ({
  id: row.id,
  productId: row.product_id,
  batchNumber: row.batch_number,
  customerOrder: row.customer_order,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  leadTimeHours: row.lead_time_hours,
  quantityProduced: row.quantity_produced,
  quantityScrap: row.quantity_scrap,
  yieldPct: row.yield_pct,
  stepCount: row.step_count,
  notes: row.notes ?? null,
  steps: (row.steps ?? []).map(toRunStep),
})

export async function getProducts(): Promise<ProductSummary[]> {
  return (await request<ProductSummaryApi[]>("/products")).map(toProductSummary)
}

export async function getProduct(productId: number): Promise<Product | null> {
  try {
    return toProduct(await request<ProductApi>(`/products?product_id=${productId}`))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function getProductRuns(productId: number): Promise<ProductionRun[]> {
  return (await request<RunApi[]>(`/products/${productId}/runs`)).map(toRun)
}

export async function getProductRun(productId: number, runId: number): Promise<ProductionRun | null> {
  try {
    return toRun(await request<RunApi>(`/products/${productId}/runs?run_id=${runId}`))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function getProductFlows(): Promise<ProductFlow[]> {
  return (await request<FlowApi[]>("/products/flows")).map((flow) => ({
    productId: flow.product_id,
    reference: flow.reference,
    name: flow.name,
    color: flow.color,
    processIds: flow.process_ids,
    finalProcessIds: flow.final_process_ids,
    edges: flow.edges.map((edge) => ({
      fromStepId: edge.from_step_id,
      toStepId: edge.to_step_id,
      sourceProcessId: edge.source_process_id,
      targetProcessId: edge.target_process_id,
    })),
  }))
}

export type ProductInput = {
  reference: string
  name: string
  description?: string | null
  category?: string | null
  material?: string | null
  standard?: string | null
  unit: string
  revision: string
  status: ProductStatus
  color?: string | null
  specifications: { name: string; value: string; unit?: string | null }[]
}

export const createProduct = async (input: ProductInput) => toProduct(await post<ProductApi>("/products", input))
export const updateProduct = async (id: number, input: Partial<ProductInput>) =>
  toProduct(await patch<ProductApi>(`/products/${id}`, input))
export const deleteProduct = (id: number) => request<void>(`/products/${id}`, { method: "DELETE" })

export type StepInput = {
  process_id: number
  name: string
  description?: string | null
  standard_duration_minutes?: number | null
  depends_on_step_ids: number[]
}
export const createStep = (productId: number, input: StepInput) => post<StepApi>(`/products/${productId}/steps`, input)
export const updateStep = (productId: number, stepId: number, input: Partial<StepInput>) =>
  patch<StepApi>(`/products/${productId}/steps/${stepId}`, input)
export const deleteStep = (productId: number, stepId: number) =>
  request<void>(`/products/${productId}/steps/${stepId}`, { method: "DELETE" })

export async function uploadProductFiles(productId: number, files: File[]) {
  const form = new FormData()
  files.forEach((file) => form.append("files", file))
  let response: Response
  try {
    response = await fetch(`${API_BASE}/products/${productId}/files`, { method: "POST", body: form, credentials: "include" })
  } catch {
    throw new ApiError("Cannot reach the Prominox API. Is the back-end running?", 0)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    await handleAuthFailure(response, body, "")
    throw new ApiError(errorMessage(body, response.status), response.status)
  }
}
export const deleteProductFile = (productId: number, fileId: number) =>
  request<void>(`/products/${productId}/files/${fileId}`, { method: "DELETE" })

export type RunInput = {
  batch_number: string
  customer_order?: string | null
  started_at: string
  ended_at: string
  quantity_produced: number
  quantity_scrap: number
  notes?: string | null
  steps: {
    product_step_id?: number | null
    step_name?: string | null
    process_id?: number | null
    instance?: number | null
    started_at: string
    ended_at: string
    quantity_in: number
    quantity_out: number
    quantity_scrap: number
    operator?: string | null
    notes?: string | null
  }[]
}
export const createRun = async (productId: number, input: RunInput) =>
  toRun(await post<RunApi>(`/products/${productId}/runs`, input))
export const deleteRun = (productId: number, runId: number) =>
  request<void>(`/products/${productId}/runs/${runId}`, { method: "DELETE" })

export const productExportUrl = {
  products: () => `${API_BASE}/exports/products.csv`,
  runs: (productId?: number) => `${API_BASE}/exports/production-runs.csv${productId !== undefined ? `?product_id=${productId}` : ""}`,
  runSteps: (productId?: number) =>
    `${API_BASE}/exports/production-run-steps.csv${productId !== undefined ? `?product_id=${productId}` : ""}`,
}

export type ProcessOption = { id: number; name: string; code: string | null; status: ProcessStatus; type: ProcessType; quantity: number }

/** Lightweight process list (no readings) for pickers. */
export async function getProcessOptions(): Promise<ProcessOption[]> {
  const rows = await request<ProcessApi[]>("/processes")
  return rows.map((row) => ({ id: row.id, name: row.name, code: row.code, status: row.status, type: row.type, quantity: row.quantity }))
}

// =====================================================================
// RRT: live data from Node-RED
// =====================================================================
export type RrtConfig = {
  enabled: boolean
  ingestPath: string | null
  /** Full URL Node-RED must POST to (host is the API base this app uses) */
  ingestUrl: string | null
  enabledAt: string | null
  lastReceivedAt: string | null
  lastError: string | null
  lastErrorAt: string | null
}

type RrtConfigApi = {
  enabled: boolean
  ingest_path: string | null
  enabled_at: string | null
  last_received_at: string | null
  last_error: string | null
  last_error_at: string | null
}

const toRrtConfig = (row: RrtConfigApi): RrtConfig => ({
  enabled: row.enabled,
  ingestPath: row.ingest_path,
  ingestUrl: row.ingest_path ? `${API_URL}${row.ingest_path}` : null,
  enabledAt: row.enabled_at,
  lastReceivedAt: row.last_received_at,
  lastError: row.last_error,
  lastErrorAt: row.last_error_at,
})

export async function getRrtConfig(processId: number) {
  return toRrtConfig(await request<RrtConfigApi>(`/processes/${processId}/rrt`))
}
export async function setRrtEnabled(processId: number, enabled: boolean) {
  return toRrtConfig(await request<RrtConfigApi>(`/processes/${processId}/rrt`, { method: "PUT", body: JSON.stringify({ enabled }) }))
}
export async function rotateRrtToken(processId: number) {
  return toRrtConfig(await post<RrtConfigApi>(`/processes/${processId}/rrt/rotate-token`, {}))
}

export type LiveUpdate = {
  enabled: boolean
  lastReceivedAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  readings: SensorReading[]
  serverTime: string
}

/** Polled by the live charts: readings at or after `since` plus the connection status. */
export async function getLiveUpdate(processId: number, since?: string): Promise<LiveUpdate> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "?limit=200"
  const data = await request<{
    rrt: { enabled: boolean; last_received_at: string | null; last_error: string | null; last_error_at: string | null }
    readings: SensorReading[]
    server_time: string
  }>(`/processes/${processId}/live${query}`)
  return {
    enabled: data.rrt.enabled,
    lastReceivedAt: data.rrt.last_received_at,
    lastError: data.rrt.last_error,
    lastErrorAt: data.rrt.last_error_at,
    readings: data.readings,
    serverTime: data.server_time,
  }
}


// --- Authentication ---
export type AuthUser = {
  id: number
  username: string
  name: string
  email: string | null
  role: "admin" | "user"
  mustChangePassword: boolean
  createdAt: string
  lastLoginAt: string | null
  passwordChangedAt: string | null
}
type AuthUserApi = {
  id: number
  username: string
  name: string
  email: string | null
  role: "admin" | "user"
  must_change_password: boolean
  created_at: string
  last_login_at: string | null
  password_changed_at: string | null
}
const toAuthUser = (row: AuthUserApi): AuthUser => ({
  id: row.id,
  username: row.username,
  name: row.name,
  email: row.email,
  role: row.role,
  mustChangePassword: row.must_change_password,
  createdAt: row.created_at,
  lastLoginAt: row.last_login_at,
  passwordChangedAt: row.password_changed_at,
})

export const login = async (username: string, password: string) =>
  toAuthUser(await post<AuthUserApi>("/auth/login", { username, password }))
export const logout = () => request<void>("/auth/logout", { method: "POST" })
export const getMe = async () => toAuthUser(await request<AuthUserApi>("/auth/me"))
/** Like getMe, but returns null instead of redirecting when nobody is signed in. */
export async function getMeOrNull(): Promise<AuthUser | null> {
  try {
    return toAuthUser(await request<AuthUserApi>("/auth/me", undefined, { silentAuth: true }))
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}
export const changePassword = async (currentPassword: string, newPassword: string) =>
  toAuthUser(await post<AuthUserApi>("/auth/change-password", { current_password: currentPassword, new_password: newPassword }))
export const updateEmail = async (currentPassword: string, email: string | null) =>
  toAuthUser(await patch<AuthUserApi>("/auth/me/email", { current_password: currentPassword, email }))

// --- Admin: users and journal ---
export type IssuedCredentials = {
  user: AuthUser
  username: string
  password: string
  pdfBase64: string
  pdfFilename: string
}
type IssuedCredentialsApi = {
  user: AuthUserApi
  credentials: { username: string; password: string }
  pdf_base64: string
  pdf_filename: string
}
const toIssued = (row: IssuedCredentialsApi): IssuedCredentials => ({
  user: toAuthUser(row.user),
  username: row.credentials.username,
  password: row.credentials.password,
  pdfBase64: row.pdf_base64,
  pdfFilename: row.pdf_filename,
})

export const getUsers = async () => (await request<AuthUserApi[]>("/admin/users")).map(toAuthUser)
export const createUser = async (name: string) => toIssued(await post<IssuedCredentialsApi>("/admin/users", { name }))
export const resetUserPassword = async (id: number) =>
  toIssued(await post<IssuedCredentialsApi>(`/admin/users/${id}/reset-password`, {}))
export const deleteUser = (id: number) => request<void>(`/admin/users/${id}`, { method: "DELETE" })

export type AuditEntry = {
  id: number
  at: string
  actorUsername: string
  action: string
  targetUsername: string | null
  details: Record<string, unknown> | null
  ipAddress: string | null
}
export async function getAuditLog(opts: { limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams({ limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) })
  const data = await request<{
    items: {
      id: number
      at: string
      actor_username: string
      action: string
      target_username: string | null
      details: Record<string, unknown> | null
      ip_address: string | null
    }[]
    total: number
  }>(`/admin/audit-log?${params}`)
  return {
    total: data.total,
    items: data.items.map<AuditEntry>((row) => ({
      id: row.id,
      at: row.at,
      actorUsername: row.actor_username,
      action: row.action,
      targetUsername: row.target_username,
      details: row.details,
      ipAddress: row.ip_address,
    })),
  }
}

// --- AI Lab ---
// These types mirror the API payloads as they are (snake_case); nothing else in the app consumes them.
export type AiSensor = { id: number; name: string; data_type: SensorDataType; reading_count: number; first_at: string | null; last_at: string | null }
export type AiProcess = { id: number; name: string; code: string | null; status: string; corrective_count: number; sensors: AiSensor[] }
export type AiProduct = { id: number; reference: string; name: string; unit: string; run_count: number }
export type AiCatalog = { processes: AiProcess[]; products: AiProduct[] }

export type ForecastResult = {
  sensor_name: string
  model: string
  quality: "good" | "fair" | "poor"
  mae: number
  baseline_mae: number
  improvement_pct: number
  step_seconds: number
  horizon_steps: number
  readings_used: number
  history: { t: string; value: number }[]
  forecast: { t: string; value: number; lower: number; upper: number }[]
  candidates: { name: string; mae: number | null }[]
}

export type SensorAnomalies = {
  sensor_id: number
  name: string
  data_type: SensorDataType
  readings: number
  anomaly_count: number
  skipped_reason: string | null
  events: { start: string; end: string; count: number; peak_value: number; expected: number; score: number }[]
  series: { t: string; value: number; expected: number; score: number; flagged: boolean }[]
  rare_values: { value: string; count: number; share_pct: number; last_seen: string }[]
}
export type AnomalyResult = { window_start: string | null; window_end: string | null; sensors: SensorAnomalies[] }

export type MaintenanceRisk = {
  process_id: number
  process_name: string
  process_code: string | null
  ready: boolean
  note: string | null
  corrective_events: number
  status: PredictionStatus | null
  probability_14d: number | null
  mean_interval_days: number | null
  days_since_last: number | null
  last_corrective_at: string | null
  next_expected_at: string | null
  remaining_days: number | null
  overdue: boolean | null
  confidence: number | null
  intervals_days: number[]
}

type Estimate = { value: number; low: number; high: number }
export type ProductionEstimate = {
  product_name: string
  unit: string
  runs_used: number
  ready: boolean
  note: string | null
  quantity: number
  lead_time: Estimate | null
  scrap_pct: Estimate | null
  r2: number | null
  hours_per_unit: number | null
  setup_hours: number | null
  runs: { batch: string; quantity: number; lead_time_hours: number; scrap_pct: number }[]
  line: { quantity: number; lead_time_hours: number }[]
}

export const getAiCatalog = () => request<AiCatalog>("/ai/catalog")
export const getMaintenanceRisk = () => request<MaintenanceRisk[]>("/ai/maintenance-risk")
export const runForecast = (body: { process_id: number; sensor_id: number; history_hours: number; horizon_minutes: number }) =>
  post<ForecastResult>("/ai/forecast", body)
export const runAnomalies = (body: { process_id: number; window_hours: number; sensitivity: "low" | "medium" | "high" }) =>
  post<AnomalyResult>("/ai/anomalies", body)
export const publishMaintenanceRisk = (processId: number) => post<MaintenanceRisk>(`/ai/maintenance-risk/${processId}/snapshot`, {})
export const runProductionEstimate = (body: { product_id: number; quantity: number }) => post<ProductionEstimate>("/ai/production-estimate", body)

// --- Simulation ---
// Payload shapes as sent by the API (snake_case); only the simulation page uses them.
export type SimProduct = { id: number; reference: string; name: string; unit: string; status: string; step_count: number; process_ids: number[]; minutes_per_unit: number }
export type SimProcess = { id: number; name: string; code: string | null; status: string; capacity: number; quantity: number }
export type SimCatalog = { products: SimProduct[]; processes: SimProcess[] }

export type SimRequest = {
  orders: { product_id: number; quantity: number }[]
  transfer_minutes: number
  variability_pct: number
  seed?: number
  replications?: number
  capacity_mode: "single" | "parallel"
  strategy: SimStrategy
  compare: boolean
  overrides: { process_id: number; enabled?: boolean; instances?: number }[]
}

export type SimStrategy = "optimized" | "fifo" | "sequence" | "proportional" | "spt" | "lpt" | "remaining"

export type SimMetrics = {
  makespan_minutes: number
  throughput_per_hour: number
  avg_utilization_pct: number
  bottleneck_utilization_pct: number
  utilization_spread_pct: number
  avg_unit_completion_minutes: number
  avg_wait_minutes: number
  max_wait_minutes: number
  total_wait_hours: number
  avg_wip_units: number
  lower_bound_minutes: number
  efficiency_pct: number
}

export type SimOrderResult = {
  index: number
  product_id: number
  reference: string
  name: string
  unit: string
  quantity: number
  simulated: boolean
  blockers: { process_id: number; process_name: string; reason: string; steps: string[] }[]
  finish_minutes: number | null
  first_unit_minutes: number | null
  unit_lead_time_minutes: number | null
  /** `after` = positions of the steps this one waits for */
  steps: { name: string; process_id: number; after: number[] }[]
}

export type SimProcessResult = {
  id: number
  name: string
  code: string | null
  enabled: boolean
  capacity: number
  instances: number
  slots: number | null
  tasks: number
  busy_minutes: number
  utilization_pct: number | null
  avg_wait_minutes: number
}

export type SimResult = {
  feasible: boolean
  seed: number
  transfer_minutes: number
  variability_pct: number
  capacity_mode: string
  makespan_minutes: number | null
  orders: SimOrderResult[]
  processes: SimProcessResult[]
  bottleneck_process_id: number | null
  monte_carlo: { runs: number; expected: number; min: number; p50: number; p90: number; max: number } | null
  warnings: string[]
  strategy: SimStrategy
  strategy_label: string
  metrics: SimMetrics | null
  comparison: { strategy: SimStrategy; label: string; selected: boolean; metrics: SimMetrics; typical_p50: number | null; typical_p90: number | null }[]
  optimization: { start_rule: string; start_label: string; start_makespan: number; best_makespan: number; improvement_pct: number; iterations: number; seconds: number; history: number[][] } | null
  advice: { process_id: number; process_name: string; instances: number; utilization_pct: number; makespan_minutes: number; saving_pct: number }[]
  /** per order: sorted finish time (minutes) of every unit */
  completions: number[][]
  /** rows of [order, unit, step, slot, avail, ready, start, end] (minutes) */
  trace: number[][]
}

export const getSimCatalog = () => request<SimCatalog>("/simulation/catalog")
export const runSimulation = (body: SimRequest) => post<SimResult>("/simulation/run", body)

export type SensorSummary = {
  sensor_id: number
  name: string
  data_type: SensorDataType
  readings: number
  latest: string | null
  latest_at: string | null
  min: number | null
  max: number | null
  mean: number | null
  std: number | null
  trend_per_hour: number | null
  true_share_pct: number | null
  top_values: { value: string; count: number }[]
}
export const getSensorSummary = (processId: number, hours: number) =>
  post<{ process_name: string; hours: number; sensors: SensorSummary[] }>("/ai/sensor-summary", { process_id: processId, hours })
