from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.process_data import ReadingRow

class RrtToggle(BaseModel):
    enabled: bool

class RrtConfig(BaseModel):
    """RRT (real-time reception) settings of one machine."""
    enabled: bool
    ingest_path: Optional[str] = None  # POST here, relative to the API host
    token: Optional[str] = None
    enabled_at: Optional[datetime] = None
    last_received_at: Optional[datetime] = None
    last_error: Optional[str] = None
    last_error_at: Optional[datetime] = None

class IngestResult(BaseModel):
    inserted: int
    rows: int
    received_at: datetime

class LiveStatus(BaseModel):
    enabled: bool
    last_received_at: Optional[datetime] = None
    last_error: Optional[str] = None
    last_error_at: Optional[datetime] = None

class LiveResponse(BaseModel):
    rrt: LiveStatus
    readings: List[ReadingRow]
    server_time: datetime
