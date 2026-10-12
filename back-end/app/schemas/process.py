from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional

from app.schemas.department import DepartmentPosition, DepartmentResponse
from app.schemas.process_data import (
    MaintenanceLogResponse,
    PredictionSnapshotResponse,
    ReadingRow,
    SensorResponse,
)
from app.schemas.process_image import ProcessImageResponse

class ProcessType(str, Enum):
    manual = "manual"    # performed by a person
    machine = "machine"  # performed by a machine

class ProcessStatus(str, Enum):
    active = "active"      # exists in the factory
    inactive = "inactive"  # disabled, does not exist in the factory

def _clean_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("name must not be empty")
    return value

# Base schema with shared attributes
class ProcessBase(BaseModel):
    name: str = Field(max_length=150)
    type: ProcessType
    description: Optional[str] = None
    capacity: int = Field(default=0, ge=0, description="0 means dynamic (no fixed limit)")
    quantity: int = Field(default=1, ge=1, description="Instances that can run in parallel")

    _strip_name = field_validator("name")(_clean_name)

# Schema for creating a new Process (Input payload)
class ProcessCreate(ProcessBase):
    department_id: int
    code: Optional[str] = None
    status: ProcessStatus = ProcessStatus.active
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    scheduled_hours_30d: float = Field(default=0, ge=0)

class ProcessUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    type: Optional[ProcessType] = None
    description: Optional[str] = None
    capacity: Optional[int] = Field(default=None, ge=0)
    quantity: Optional[int] = Field(default=None, ge=1)
    code: Optional[str] = None
    status: Optional[ProcessStatus] = None
    department_id: Optional[int] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    scheduled_hours_30d: Optional[float] = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value):
        return _clean_name(value) if value is not None else value

class ProcessPosition(BaseModel):
    id: int
    position_x: float
    position_y: float

class MapLayoutUpdate(BaseModel):
    """Saved in one transaction from the factory map's Save button."""
    departments: List[DepartmentPosition] = []
    processes: List[ProcessPosition] = []

# Schema for returning a Process (Output payload with ID)
class ProcessResponse(ProcessBase):
    id: int
    code: Optional[str] = None
    status: ProcessStatus
    department_id: int
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    last_update: Optional[datetime] = None
    scheduled_hours_30d: float = 0
    selected_model_id: Optional[int] = None
    rrt_enabled: bool = False
    rrt_last_received_at: Optional[datetime] = None

    class Config:
        from_attributes = True  # Allows Pydantic to read SQLAlchemy model objects

# Full view used by the dashboard and the process detail page
class ProcessDetailResponse(ProcessResponse):
    department: Optional[DepartmentResponse] = None
    sensors: List[SensorResponse] = []
    sensor_data: List[ReadingRow] = []
    images: List[ProcessImageResponse] = []
    maintenance_logs: List[MaintenanceLogResponse] = []
    latest_prediction: Optional[PredictionSnapshotResponse] = None

class DashboardResponse(BaseModel):
    processes: List[ProcessDetailResponse]
    departments: List[DepartmentResponse]
    recent_maintenance: List[MaintenanceLogResponse]
