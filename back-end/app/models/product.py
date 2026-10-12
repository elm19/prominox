from sqlalchemy import (
    CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, String, Table, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from app.database import Base

# Association table for step-to-step dependencies (a step starts after the steps it depends on)
step_dependencies = Table(
    "step_dependencies",
    Base.metadata,
    Column("step_id", Integer, ForeignKey("product_steps.id", ondelete="CASCADE"), primary_key=True),
    Column("depends_on_step_id", Integer, ForeignKey("product_steps.id", ondelete="CASCADE"), primary_key=True),
)


class ProductDB(Base):
    """A product definition: what is made and the routing (steps through processes) to make it."""
    __tablename__ = "products"
    __table_args__ = (CheckConstraint("status IN ('active', 'archived')", name="ck_products_status"),)

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String, nullable=False, unique=True)  # SKU / part number
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    category = Column(String, nullable=True)
    material = Column(String, nullable=True)   # e.g. steel grade
    standard = Column(String, nullable=True)   # e.g. EN 10217-1
    unit = Column(String, nullable=False, server_default="piece")  # unit quantities are expressed in
    revision = Column(String, nullable=False, server_default="1")
    status = Column(String, nullable=False, server_default="active")  # active | archived
    color = Column(String, nullable=False, server_default="#38bdf8")  # colour of this product's flow on the map
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    @property
    def step_count(self) -> int:
        return len(self.steps)

    @property
    def process_count(self) -> int:
        return len({step.process_id for step in self.steps})

    @property
    def run_count(self) -> int:
        return len(self.runs)

    @property
    def thumbnail_url(self) -> str | None:
        return next((file.url for file in self.files if file.kind == "image"), None)

    specs = relationship(
        "ProductSpecDB", back_populates="product", cascade="all, delete-orphan", order_by="ProductSpecDB.id"
    )
    files = relationship(
        "ProductFileDB", back_populates="product", cascade="all, delete-orphan", order_by="ProductFileDB.id"
    )
    steps = relationship(
        "ProductStepDB", back_populates="product", cascade="all, delete-orphan",
        order_by="ProductStepDB.sequence, ProductStepDB.id",
    )
    runs = relationship(
        "ProductionRunDB", back_populates="product", cascade="all, delete-orphan",
        order_by="ProductionRunDB.started_at.desc()",
    )


class ProductSpecDB(Base):
    """User-defined specification line, e.g. 'Outer diameter' = '323.9' mm."""
    __tablename__ = "product_specs"
    __table_args__ = (UniqueConstraint("product_id", "name", name="uq_product_specs_product_name"),)

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    value = Column(String, nullable=False)
    unit = Column(String, nullable=True)

    product = relationship("ProductDB", back_populates="specs")


class ProductFileDB(Base):
    """An image or PDF document (drawing, datasheet, certificate...) attached to a product."""
    __tablename__ = "product_files"
    __table_args__ = (CheckConstraint("kind IN ('image', 'pdf')", name="ck_product_files_kind"),)

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String, nullable=False)  # image | pdf
    filename = Column(String, nullable=False)
    stored_name = Column(String, nullable=False, unique=True)
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    product = relationship("ProductDB", back_populates="files")

    @property
    def url(self) -> str:
        return f"/api/v1/media/product-files/{self.stored_name}"


class ProductStepDB(Base):
    """One operation of the routing, performed on a process."""
    __tablename__ = "product_steps"
    __table_args__ = (
        CheckConstraint("standard_duration_minutes IS NULL OR standard_duration_minutes >= 0", name="ck_product_steps_duration"),
    )

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    process_id = Column(Integer, ForeignKey("processes.id"), nullable=False)
    name = Column(String, nullable=False)
    sequence = Column(Integer, nullable=False, server_default="0")  # display order among steps
    description = Column(String, nullable=True)  # work instructions
    standard_duration_minutes = Column(Float, nullable=True)  # expected time per unit

    product = relationship("ProductDB", back_populates="steps")
    process = relationship("ProcessDB")

    depends_on = relationship(
        "ProductStepDB",
        secondary=step_dependencies,
        primaryjoin=id == step_dependencies.c.step_id,
        secondaryjoin=id == step_dependencies.c.depends_on_step_id,
        backref="required_for_steps",
    )

    @property
    def process_name(self) -> str:
        return self.process.name

    @property
    def is_final(self) -> bool:
        """The last operation(s) of the cycle: no other step waits for this one."""
        return len(self.required_for_steps) == 0

    @property
    def depends_on_step_ids(self) -> list[int]:
        return sorted(step.id for step in self.depends_on)
