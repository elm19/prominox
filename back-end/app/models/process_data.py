from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class ProcessSensorDB(Base):
    """A user-defined sensor. `data_type` decides which value column its readings use."""
    __tablename__ = "process_sensors"
    __table_args__ = (
        UniqueConstraint("process_id", "name", name="uq_process_sensors_process_name"),
        CheckConstraint("data_type IN ('text', 'number', 'boolean')", name="ck_process_sensors_data_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    process_id = Column(Integer, ForeignKey("processes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    data_type = Column(String, nullable=False)  # text | number | boolean
    description = Column(String, nullable=True)

    process = relationship("ProcessDB", back_populates="sensors")
    readings = relationship("SensorReadingDB", back_populates="sensor", cascade="all, delete-orphan")


class SensorReadingDB(Base):
    """Exactly one of the value_* columns is set, matching the sensor's data_type."""
    __tablename__ = "sensor_readings"
    __table_args__ = (
        UniqueConstraint("sensor_id", "recorded_at"),
        CheckConstraint(
            "(value_number IS NOT NULL)::int + (value_text IS NOT NULL)::int + (value_bool IS NOT NULL)::int = 1",
            name="ck_sensor_readings_one_value",
        ),
    )

    id = Column(Integer, primary_key=True)
    process_id = Column(Integer, ForeignKey("processes.id", ondelete="CASCADE"), nullable=False, index=True)
    sensor_id = Column(Integer, ForeignKey("process_sensors.id", ondelete="CASCADE"), nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False, index=True)
    value_number = Column(Float, nullable=True)
    value_text = Column(String, nullable=True)
    value_bool = Column(Boolean, nullable=True)

    sensor = relationship("ProcessSensorDB", back_populates="readings")

    @property
    def value(self):
        if self.value_number is not None:
            return self.value_number
        if self.value_bool is not None:
            return self.value_bool
        return self.value_text


class MaintenanceLogDB(Base):
    __tablename__ = "maintenance_logs"

    id = Column(Integer, primary_key=True, index=True)
    process_id = Column(Integer, ForeignKey("processes.id", ondelete="CASCADE"), nullable=False, index=True)
    performed_at = Column(DateTime(timezone=True), nullable=False, index=True)
    type = Column(String, nullable=False)    # inspection | preventive | corrective | calibration | lubrication
    description = Column(String, nullable=False)
    status = Column(String, nullable=False)  # solved | pending | in_progress
    downtime_hours = Column(Float, nullable=False, server_default="0")
    technician = Column(String, nullable=True)

    process = relationship("ProcessDB", back_populates="maintenance_logs")


class PredictionSnapshotDB(Base):
    """Latest prediction shown on a process page. Written by AI Lab later."""
    __tablename__ = "process_prediction_snapshots"

    id = Column(Integer, primary_key=True)
    process_id = Column(Integer, ForeignKey("processes.id", ondelete="CASCADE"), nullable=False, index=True)
    model_id = Column(Integer, nullable=True)
    result = Column(String, nullable=False)
    remaining_useful_life_hours = Column(Float, nullable=True)
    next_maintenance_date = Column(DateTime(timezone=True), nullable=True)
    confidence = Column(Float, nullable=False)
    last_prediction_date = Column(DateTime(timezone=True), nullable=False)
    status = Column(String, nullable=False)  # healthy | observe | service_soon
    is_latest = Column(Boolean, nullable=False, server_default="true")

    process = relationship("ProcessDB", back_populates="prediction_snapshots")
