from pydantic import BaseModel, Field, field_validator
from typing import Optional

def _clean_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("name must not be empty")
    return value

class DepartmentBase(BaseModel):
    name: str = Field(max_length=100)
    description: Optional[str] = None

    _strip_name = field_validator("name")(_clean_name)

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value):
        return _clean_name(value) if value is not None else value

class DepartmentPosition(BaseModel):
    id: int
    position_x: float
    position_y: float

class DepartmentResponse(DepartmentBase):
    id: int
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    process_count: int = 0

    class Config:
        from_attributes = True
