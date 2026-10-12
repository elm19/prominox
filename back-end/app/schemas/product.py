import re
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")

class ProductStatus(str, Enum):
    active = "active"      # in the catalogue
    archived = "archived"  # no longer produced, history is kept

def _strip(value: Optional[str]) -> Optional[str]:
    return value.strip() if isinstance(value, str) else value

def _required(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("must not be empty")
    return value

# --- Specifications (user-defined) ---
class SpecInput(BaseModel):
    name: str = Field(max_length=100)
    value: str = Field(max_length=200)
    unit: Optional[str] = Field(default=None, max_length=30)

    _name = field_validator("name", "value")(_required)

class SpecResponse(SpecInput):
    id: int

    class Config:
        from_attributes = True

def _unique_spec_names(specs: Optional[List[SpecInput]]):
    if specs is None:
        return specs
    names = [spec.name.lower() for spec in specs]
    if len(set(names)) != len(names):
        raise ValueError("specification names must be unique")
    return specs

# --- Files ---
class ProductFileResponse(BaseModel):
    id: int
    product_id: int
    kind: str
    filename: str
    content_type: str
    size_bytes: int
    url: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- Steps (routing) ---
class StepCreate(BaseModel):
    process_id: int
    name: str = Field(max_length=150)
    description: Optional[str] = None
    standard_duration_minutes: Optional[float] = Field(default=None, ge=0, description="Expected time per unit")
    depends_on_step_ids: List[int] = []  # steps of this product that must be done first

    _name = field_validator("name")(_required)

class StepUpdate(BaseModel):
    process_id: Optional[int] = None
    name: Optional[str] = Field(default=None, max_length=150)
    description: Optional[str] = None
    standard_duration_minutes: Optional[float] = Field(default=None, ge=0)
    depends_on_step_ids: Optional[List[int]] = None  # replaces the dependencies when given

    @field_validator("name")
    @classmethod
    def _name(cls, value):
        return _required(value) if value is not None else value

class StepResponse(BaseModel):
    id: int
    product_id: int
    process_id: int
    process_name: str
    name: str
    sequence: int
    description: Optional[str] = None
    standard_duration_minutes: Optional[float] = None
    depends_on_step_ids: List[int] = []
    is_final: bool = False  # last step of the cycle: the product is finished here

    class Config:
        from_attributes = True

# --- Products ---
class ProductBase(BaseModel):
    reference: str = Field(max_length=60, description="SKU / part number, unique")
    name: str = Field(max_length=150)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=100)
    material: Optional[str] = Field(default=None, max_length=100)
    standard: Optional[str] = Field(default=None, max_length=100)
    unit: str = Field(default="piece", max_length=30, description="Unit quantities are expressed in")
    revision: str = Field(default="1", max_length=30)
    status: ProductStatus = ProductStatus.active
    color: Optional[str] = Field(default=None, description="#RRGGBB, colour of this product on the factory map")

    _required = field_validator("reference", "name", "unit", "revision")(_required)
    _strip = field_validator("category", "material", "standard")(_strip)

    @field_validator("color")
    @classmethod
    def _color(cls, value):
        if value is not None and not HEX_COLOR.match(value):
            raise ValueError("color must look like #1a2b3c")
        return value.lower() if value else value

class ProductCreate(ProductBase):
    specifications: List[SpecInput] = []

    _specs = field_validator("specifications")(_unique_spec_names)

class ProductUpdate(BaseModel):
    reference: Optional[str] = Field(default=None, max_length=60)
    name: Optional[str] = Field(default=None, max_length=150)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=100)
    material: Optional[str] = Field(default=None, max_length=100)
    standard: Optional[str] = Field(default=None, max_length=100)
    unit: Optional[str] = Field(default=None, max_length=30)
    revision: Optional[str] = Field(default=None, max_length=30)
    status: Optional[ProductStatus] = None
    color: Optional[str] = None
    specifications: Optional[List[SpecInput]] = None  # replaces the specifications when given

    _specs = field_validator("specifications")(_unique_spec_names)

    @field_validator("reference", "name", "unit", "revision")
    @classmethod
    def _req(cls, value):
        return _required(value) if value is not None else value

    @field_validator("color")
    @classmethod
    def _color(cls, value):
        if value is not None and not HEX_COLOR.match(value):
            raise ValueError("color must look like #1a2b3c")
        return value.lower() if value else value

class ProductSummary(BaseModel):
    id: int
    reference: str
    name: str
    category: Optional[str] = None
    status: ProductStatus
    color: str
    unit: str
    revision: str
    step_count: int
    process_count: int
    run_count: int
    thumbnail_url: Optional[str] = None

    class Config:
        from_attributes = True

class ProductStats(BaseModel):
    run_count: int = 0
    total_produced: float = 0
    total_scrap: float = 0
    yield_pct: Optional[float] = None
    avg_lead_time_hours: Optional[float] = None
    last_run_at: Optional[datetime] = None

class ProductDetail(ProductSummary):
    description: Optional[str] = None
    material: Optional[str] = None
    standard: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    specs: List[SpecResponse] = []
    files: List[ProductFileResponse] = []
    steps: List[StepResponse] = []
    stats: ProductStats = ProductStats()

# --- Product flows for the factory map ---
class FlowEdge(BaseModel):
    from_step_id: int
    to_step_id: int
    source_process_id: int
    target_process_id: int

class ProductFlow(BaseModel):
    product_id: int
    reference: str
    name: str
    color: str
    process_ids: List[int]  # every process the product passes through
    final_process_ids: List[int] = []  # processes where the product's cycle ends
    edges: List[FlowEdge]
