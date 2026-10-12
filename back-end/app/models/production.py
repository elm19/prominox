from sqlalchemy import CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship
from app.database import Base


class ProductionRunDB(Base):
    """A past production run (batch) of a product. History only: recorded after the fact."""
    __tablename__ = "production_runs"
    __table_args__ = (
        UniqueConstraint("product_id", "batch_number", name="uq_production_runs_product_batch"),
        CheckConstraint("ended_at >= started_at", name="ck_production_runs_dates"),
        CheckConstraint("quantity_produced >= 0 AND quantity_scrap >= 0", name="ck_production_runs_quantities"),
    )

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_number = Column(String, nullable=False)
    customer_order = Column(String, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=False, index=True)
    ended_at = Column(DateTime(timezone=True), nullable=False)
    quantity_produced = Column(Float, nullable=False)  # good units, in the product's unit
    quantity_scrap = Column(Float, nullable=False, server_default="0")
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    product = relationship("ProductDB", back_populates="runs")

    @property
    def lead_time_hours(self) -> float:
        return (self.ended_at - self.started_at).total_seconds() / 3600

    @property
    def yield_pct(self) -> float | None:
        total = self.quantity_produced + self.quantity_scrap
        return round(self.quantity_produced / total * 100, 2) if total > 0 else None

    @property
    def step_count(self) -> int:
        return len(self.steps)

    steps = relationship(
        "ProductionRunStepDB", back_populates="run", cascade="all, delete-orphan",
        order_by="ProductionRunStepDB.started_at, ProductionRunStepDB.id",
    )


class ProductionRunStepDB(Base):
    """How one operation of a run was actually executed: on which process, when, how much."""
    __tablename__ = "production_run_steps"
    __table_args__ = (
        CheckConstraint("ended_at >= started_at", name="ck_production_run_steps_dates"),
        CheckConstraint("quantity_in >= 0 AND quantity_out >= 0 AND quantity_scrap >= 0", name="ck_production_run_steps_quantities"),
        CheckConstraint("instance IS NULL OR instance >= 1", name="ck_production_run_steps_instance"),
    )

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("production_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    # The routing step this execution belongs to; kept as a name snapshot if the step is later deleted
    product_step_id = Column(Integer, ForeignKey("product_steps.id", ondelete="SET NULL"), nullable=True)
    step_name = Column(String, nullable=False)
    process_id = Column(Integer, ForeignKey("processes.id"), nullable=False, index=True)
    instance = Column(Integer, nullable=True)  # which of the process's parallel instances ran it
    started_at = Column(DateTime(timezone=True), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=False)
    quantity_in = Column(Float, nullable=False)
    quantity_out = Column(Float, nullable=False)
    quantity_scrap = Column(Float, nullable=False, server_default="0")
    operator = Column(String, nullable=True)
    notes = Column(String, nullable=True)

    run = relationship("ProductionRunDB", back_populates="steps")
    process = relationship("ProcessDB")
    product_step = relationship("ProductStepDB")

    @property
    def duration_minutes(self) -> float:
        return (self.ended_at - self.started_at).total_seconds() / 60

    @property
    def process_name(self) -> str:
        return self.process.name

    @property
    def process_code(self) -> str | None:
        return self.process.code
