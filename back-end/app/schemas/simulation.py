from typing import Literal, Optional

from pydantic import BaseModel, Field

class SimProduct(BaseModel):
    id: int
    reference: str
    name: str
    unit: str
    status: str
    step_count: int
    process_ids: list[int]
    minutes_per_unit: float  # one unit alone, no waiting, no transfers

class SimProcess(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    status: str
    capacity: int
    quantity: int

class SimulationCatalog(BaseModel):
    products: list[SimProduct]
    processes: list[SimProcess]

class OrderInput(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=5000)

class ProcessOverride(BaseModel):
    process_id: int
    enabled: Optional[bool] = None   # force on/off regardless of the process status
    instances: Optional[int] = Field(None, ge=0, le=100)

class SimulationRequest(BaseModel):
    orders: list[OrderInput] = Field(min_length=1, max_length=10)
    transfer_minutes: float = Field(5, ge=0, le=24 * 60)
    variability_pct: float = Field(10, ge=0, le=100)
    seed: Optional[int] = None
    replications: int = Field(30, ge=0, le=200)
    strategy: Literal["fifo", "sequence", "proportional", "spt", "lpt", "remaining", "optimized"] = "optimized"
    compare: bool = True  # also evaluate every other strategy
    capacity_mode: Literal["single", "parallel"] = "single"  # single: one unit per instance; parallel: `capacity` units per instance
    overrides: list[ProcessOverride] = []

class Blocker(BaseModel):
    process_id: int
    process_name: str
    reason: str  # off | no capacity | missing
    steps: list[str]

class OrderResult(BaseModel):
    index: int
    product_id: int
    reference: str
    name: str
    unit: str
    quantity: int
    simulated: bool
    blockers: list[Blocker] = []
    finish_minutes: Optional[float] = None
    first_unit_minutes: Optional[float] = None
    unit_lead_time_minutes: Optional[float] = None
    steps: list[dict] = []  # [{name, process_id}] in trace order

class ProcessResult(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    enabled: bool
    capacity: int
    instances: int
    slots: Optional[int] = None
    tasks: int
    busy_minutes: float
    utilization_pct: Optional[float] = None
    avg_wait_minutes: float

class MonteCarlo(BaseModel):
    runs: int
    expected: float
    min: float
    p50: float
    p90: float
    max: float

class SimulationResponse(BaseModel):
    feasible: bool
    seed: int
    transfer_minutes: float
    variability_pct: float
    capacity_mode: str
    makespan_minutes: Optional[float] = None
    orders: list[OrderResult]
    processes: list[ProcessResult]
    bottleneck_process_id: Optional[int] = None
    monte_carlo: Optional[MonteCarlo] = None
    strategy: str = "optimized"
    strategy_label: str = ""
    metrics: Optional[RunMetrics] = None
    comparison: list[StrategyRow] = []
    optimization: Optional[OptimizationInfo] = None
    advice: list[CapacityAdvice] = []
    warnings: list[str] = []
    completions: list[list[float]] = []
    trace: list[list[float]] = []


class RunMetrics(BaseModel):
    makespan_minutes: float
    throughput_per_hour: float
    avg_utilization_pct: float
    bottleneck_utilization_pct: float
    utilization_spread_pct: float
    avg_unit_completion_minutes: float
    avg_wait_minutes: float
    max_wait_minutes: float
    total_wait_hours: float
    avg_wip_units: float
    lower_bound_minutes: float
    efficiency_pct: float

class StrategyRow(BaseModel):
    strategy: str
    label: str
    selected: bool
    metrics: RunMetrics            # without randomness
    typical_p50: Optional[float] = None   # makespan over repeated random runs
    typical_p90: Optional[float] = None

class OptimizationInfo(BaseModel):
    start_rule: str
    start_label: str
    start_makespan: float
    best_makespan: float
    improvement_pct: float
    iterations: int
    seconds: float
    history: list[list[float]]


class CapacityAdvice(BaseModel):
    process_id: int
    process_name: str
    instances: int
    utilization_pct: float
    makespan_minutes: float      # with one more instance, no randomness
    saving_pct: float
