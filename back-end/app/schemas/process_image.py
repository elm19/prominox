from datetime import datetime
from pydantic import BaseModel

class ProcessImageResponse(BaseModel):
    id: int
    process_id: int
    filename: str
    content_type: str
    size_bytes: int
    url: str
    created_at: datetime

    class Config:
        from_attributes = True
