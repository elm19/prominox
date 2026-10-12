from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

# --- Catalog: what each model can currently be run on ---
class CatalogSensor(BaseModel):
    id: int
    name: str
    data_type: str
    reading_count: int
    first_at: Optional[datetime] = None
    last_at: Optional[datetime] = None

class CatalogProcess(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    status: str
    corrective_count: int
    sensors: list[CatalogSensor]

class CatalogProduct(BaseModel):
    id: int
    reference: str
    name: str
    unit: str
    run_count: int

class AiCatalog(BaseModel):
    processes: list[CatalogProcess]
    products: list[CatalogProduct]

# --- Forecast ---
class ForecastRequest(BaseModel):
    process_id: int
    sensor_id: int
    history_hours: float = Field(24, gt=0, le=24 * 90)
    horizon_minutes: float = Field(60, gt=0, le=60 * 24 * 14)

class TimePoint(BaseModel):
    t: datetime
    value: float

class ForecastPoint(BaseModel):
    t: datetime
    value: float
    lower: float
    upper: float

class CandidateScore(BaseModel):
    name: str
    mae: Optional[float] = None

class ForecastResponse(BaseModel):
    sensor_name: str
    model: str
    quality: str  # good | fair | poor
    mae: float
    baseline_mae: float
    improvement_pct: float
    step_seconds: float
    horizon_steps: int
    readings_used: int
    history: list[TimePoint]
    forecast: list[ForecastPoint]
    candidates: list[CandidateScore]

# --- Anomalies ---
class Sensitivity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"

class AnomalyRequest(BaseModel):
    process_id: int
    window_hours: float = Field(24, gt=0, le=24 * 365)
    sensitivity: Sensitivity = Sensitivity.medium

class AnomalyPoint(BaseModel):
    t: datetime
    value: float
    expected: float
    score: float
    flagged: bool

class AnomalyEvent(BaseModel):
    start: datetime
    end: datetime
    count: int
    peak_value: float
    expected: float
    score: float

class RareValue(BaseModel):
    value: str
    count: int
    share_pct: float
    last_seen: datetime

class SensorAnomalies(BaseModel):
    sensor_id: int
    name: str
    data_type: str
    readings: int
    anomaly_count: int
    skipped_reason: Optional[str] = None
    events: list[AnomalyEvent] = []
    series: list[AnomalyPoint] = []
    rare_values: list[RareValue] = []

class AnomalyResponse(BaseModel):
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None
    sensors: list[SensorAnomalies]

# --- Maintenance risk ---
class MaintenanceRisk(BaseModel):
    process_id: int
    process_name: str
    process_code: Optional[str] = None
    ready: bool
    note: Optional[str] = None
    corrective_events: int
    status: Optional[str] = None  # healthy | observe | service_soon
    probability_14d: Optional[float] = None
    mean_interval_days: Optional[float] = None
    days_since_last: Optional[float] = None
    last_corrective_at: Optional[datetime] = None
    next_expected_at: Optional[datetime] = None
    remaining_days: Optional[float] = None
    overdue: Optional[bool] = None
    confidence: Optional[float] = None
    intervals_days: list[float] = []

# --- Production estimate ---
class ProductionEstimateRequest(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)

class RunPoint(BaseModel):
    batch: str
    quantity: float
    lead_time_hours: float
    scrap_pct: float

class Estimate(BaseModel):
    value: float
    low: float
    high: float

class ProductionEstimateResponse(BaseModel):
    product_name: str
    unit: str
    runs_used: int
    ready: bool
    note: Optional[str] = None
    quantity: float
    lead_time: Optional[Estimate] = None
    scrap_pct: Optional[Estimate] = None
    r2: Optional[float] = None
    hours_per_unit: Optional[float] = None
    setup_hours: Optional[float] = None
    runs: list[RunPoint] = []
    line: list[dict[str, float]] = []  # fitted line as {quantity, lead_time_hours}

# --- Sensor summary (used by the chatbot) ---
class SensorSummaryRequest(BaseModel):
    process_id: int
    hours: float = Field(24, gt=0, le=24 * 365)

class SensorSummary(BaseModel):
    sensor_id: int
    name: str
    data_type: str
    readings: int
    latest: Optional[str] = None
    latest_at: Optional[datetime] = None
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    std: Optional[float] = None
    trend_per_hour: Optional[float] = None
    true_share_pct: Optional[float] = None
    top_values: list[dict] = []

class SensorSummaryResponse(BaseModel):
    process_name: str
    hours: float
    sensors: list[SensorSummary]
