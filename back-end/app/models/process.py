from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from app.database import Base

class ProcessDB(Base):
    __tablename__ = "processes"
    __table_args__ = (
        CheckConstraint("type IN ('manual', 'machine')", name="ck_processes_type"),
        CheckConstraint("status IN ('active', 'inactive')", name="ck_processes_status"),
        CheckConstraint("capacity >= 0", name="ck_processes_capacity"),
        CheckConstraint("quantity >= 1", name="ck_processes_quantity"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # manual | machine
    description = Column(String, nullable=True)
    capacity = Column(Integer, nullable=False)  # 0 = dynamic (no fixed limit)
    quantity = Column(Integer, nullable=False, server_default="1")  # instances that can run in parallel
    status = Column(String, nullable=False, server_default="active")  # active | inactive (disabled, not in the factory)
    code = Column(String, nullable=True, unique=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False, index=True)

    # Position on the factory map, relative to the department box
    position_x = Column(Float, nullable=True)
    position_y = Column(Float, nullable=True)
    last_update = Column(DateTime(timezone=True), nullable=True)
    scheduled_hours_30d = Column(Float, nullable=False, server_default="0")
    selected_model_id = Column(Integer, nullable=True)  # reserved for AI Lab, no FK on purpose

    # RRT (real-time reception): Node-RED pushes sensor data to /ingest/{rrt_token}
    rrt_enabled = Column(Boolean, nullable=False, server_default="false")
    rrt_token = Column(String, nullable=True, unique=True)  # secret part of the ingestion URL
    rrt_enabled_at = Column(DateTime(timezone=True), nullable=True)
    rrt_last_received_at = Column(DateTime(timezone=True), nullable=True)
    rrt_last_error = Column(String, nullable=True)  # why the most recent request was rejected
    rrt_last_error_at = Column(DateTime(timezone=True), nullable=True)

    department = relationship("DepartmentDB", back_populates="processes")
    sensors = relationship(
        "ProcessSensorDB", back_populates="process", cascade="all, delete-orphan", order_by="ProcessSensorDB.id"
    )
    images = relationship(
        "ProcessImageDB", back_populates="process", cascade="all, delete-orphan", order_by="ProcessImageDB.id"
    )
    maintenance_logs = relationship(
        "MaintenanceLogDB", back_populates="process", cascade="all, delete-orphan",
        order_by="MaintenanceLogDB.performed_at.desc()",
    )
    prediction_snapshots = relationship(
        "PredictionSnapshotDB", back_populates="process", cascade="all, delete-orphan"
    )
