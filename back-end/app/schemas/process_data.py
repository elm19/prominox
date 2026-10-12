from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field, field_validator


class MaintenanceType(str, Enum):
    inspection = "inspection"
    preventive = "preventive"
    corrective = "corrective"
    calibration = "calibration"
    lubrication = "lubrication"


class MaintenanceStatus(str, Enum):
    solved = "solved"
    pending = "pending"
    in_progress = "in_progress"


class PredictionStatus(str, Enum):
    healthy = "healthy"
    observe = "observe"
    service_soon = "service_soon"


# --- Sensors (user-defined) ---
class SensorDataType(str, Enum):
    text = "text"
    number = "number"
    boolean = "boolean"

class SensorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    data_type: SensorDataType
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("name must not be empty")
        return value

class SensorUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    # data_type is intentionally not editable: existing readings were validated against it

class SensorResponse(BaseModel):
    id: int
    process_id: int
    name: str
    data_type: SensorDataType
    description: Optional[str] = None

    class Config:
        from_attributes = True


# --- Readings (wide format: one row per timestamp, values keyed by sensor id) ---
ReadingValue = Union[bool, float, str]

class ReadingRow(BaseModel):
    timestamp: datetime
    values: Dict[str, Any]  # {"<sensor id>": value}; validated against each sensor's data_type

class ReadingsCreate(BaseModel):
    readings: List[ReadingRow] = Field(min_length=1)

class ReadingsCreated(BaseModel):
    inserted: int

class ReadingError(BaseModel):
    row: int                      # 0-based index in the submitted `readings` list
    sensor_id: str
    sensor_name: Optional[str] = None
    value: Any = None
    expected: Optional[SensorDataType] = None
    message: str


# --- Maintenance logs ---
class MaintenanceLogBase(BaseModel):
    performed_at: datetime
    type: MaintenanceType
    description: str = Field(min_length=1)
    status: MaintenanceStatus
    downtime_hours: float = Field(default=0, ge=0)
    technician: Optional[str] = None

class MaintenanceLogCreate(MaintenanceLogBase):
    process_id: int

class MaintenanceLogUpdate(BaseModel):
    performed_at: Optional[datetime] = None
    type: Optional[MaintenanceType] = None
    description: Optional[str] = None
    status: Optional[MaintenanceStatus] = None
    downtime_hours: Optional[float] = Field(default=None, ge=0)
    technician: Optional[str] = None

class MaintenanceLogResponse(MaintenanceLogBase):
    id: int
    process_id: int

    class Config:
        from_attributes = True


# --- Prediction snapshot (read-only until AI Lab exists) ---
class PredictionSnapshotResponse(BaseModel):
    result: str
    remaining_useful_life_hours: Optional[float] = None
    next_maintenance_date: Optional[datetime] = None
    confidence: float
    last_prediction_date: datetime
    status: PredictionStatus

    class Config:
        from_attributes = True
