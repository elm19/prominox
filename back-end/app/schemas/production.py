from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

class RunStepInput(BaseModel):
    """One executed operation. Give `product_step_id` (name and process default from the routing)
    or both `step_name` and `process_id` for an operation outside the routing."""
    product_step_id: Optional[int] = None
    step_name: Optional[str] = Field(default=None, max_length=150)
    process_id: Optional[int] = None
    instance: Optional[int] = Field(default=None, ge=1, description="Which parallel instance of the process ran it")
    started_at: datetime
    ended_at: datetime
    quantity_in: float = Field(ge=0)
    quantity_out: float = Field(ge=0)
    quantity_scrap: float = Field(default=0, ge=0)
    operator: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _check(self):
        if self.ended_at < self.started_at:
            raise ValueError("ended_at must not be before started_at")
        if self.product_step_id is None and not (self.step_name and self.step_name.strip() and self.process_id):
            raise ValueError("give product_step_id, or both step_name and process_id")
        return self

class RunCreate(BaseModel):
    batch_number: str = Field(max_length=80)
    customer_order: Optional[str] = Field(default=None, max_length=100)
    started_at: datetime
    ended_at: datetime
    quantity_produced: float = Field(ge=0)
    quantity_scrap: float = Field(default=0, ge=0)
    notes: Optional[str] = None
    steps: List[RunStepInput] = []

    @field_validator("batch_number")
    @classmethod
    def _batch(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value

    @model_validator(mode="after")
    def _dates(self):
        if self.ended_at < self.started_at:
            raise ValueError("ended_at must not be before started_at")
        return self

class RunUpdate(BaseModel):
    """Corrects the run's own data. To change step executions, delete the run and record it again."""
    batch_number: Optional[str] = Field(default=None, max_length=80)
    customer_order: Optional[str] = Field(default=None, max_length=100)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    quantity_produced: Optional[float] = Field(default=None, ge=0)
    quantity_scrap: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None

class RunStepResponse(BaseModel):
    id: int
    run_id: int
    product_step_id: Optional[int] = None
    step_name: str
    process_id: int
    process_name: str
    process_code: Optional[str] = None
    instance: Optional[int] = None
    started_at: datetime
    ended_at: datetime
    duration_minutes: float
    quantity_in: float
    quantity_out: float
    quantity_scrap: float
    operator: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class RunSummary(BaseModel):
    id: int
    product_id: int
    batch_number: str
    customer_order: Optional[str] = None
    started_at: datetime
    ended_at: datetime
    lead_time_hours: float
    quantity_produced: float
    quantity_scrap: float
    yield_pct: Optional[float] = None
    step_count: int

    class Config:
        from_attributes = True

class RunDetail(RunSummary):
    notes: Optional[str] = None
    steps: List[RunStepResponse] = []

class RunIssue(BaseModel):
    row: Optional[int] = None  # index in `steps`; None for run-level problems
    field: str
    message: str
    value: Any = None
