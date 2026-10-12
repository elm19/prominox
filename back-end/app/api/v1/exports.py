"""CSV exports of collected factory data, meant as AI training datasets."""
import csv
import io
from datetime import datetime
from enum import Enum
from typing import Iterator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.department import DepartmentDB
from app.models.process import ProcessDB
from app.models.product import ProductDB
from app.models.production import ProductionRunDB, ProductionRunStepDB
from app.models.process_data import MaintenanceLogDB, ProcessSensorDB, SensorReadingDB
import app.crud.process as crud_process

router = APIRouter(prefix="/exports", tags=["Exports"])

class ReadingsFormat(str, Enum):
    long = "long"   # one row per (process, sensor, timestamp)
    wide = "wide"   # one row per timestamp, one column per sensor (requires process_id)

def _csv_response(rows: Iterator[list], header: list[str], filename: str) -> StreamingResponse:
    def generate():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(header)
        yield buffer.getvalue()
        for row in rows:
            buffer.seek(0)
            buffer.truncate()
            writer.writerow(row)
            yield buffer.getvalue()
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

def _iso(value: Optional[datetime]) -> str:
    return value.isoformat() if value else ""

@router.get("/readings.csv")
def export_readings(
    process_id: Optional[int] = Query(None),
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    format: ReadingsFormat = ReadingsFormat.long,
    db: Session = Depends(get_db)
):
    if format == ReadingsFormat.wide:
        if process_id is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="format=wide requires process_id")
        process = crud_process.get_process_by_id(db, process_id)
        if not process:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Process with ID {process_id} not found")
        sensors = list(process.sensors)
        data = crud_process.get_readings_wide(db, process, start=start, end=end)
        rows = ([_iso(r.timestamp)] + [r.values.get(str(sensor.id), "") for sensor in sensors] for r in data)
        return _csv_response(rows, ["timestamp", *[sensor.name for sensor in sensors]], f"readings_{process.code or process.id}_wide.csv")

    query = (
        db.query(ProcessDB.id, ProcessDB.code, ProcessDB.name, DepartmentDB.name, ProcessSensorDB.id,
                 ProcessSensorDB.name, ProcessSensorDB.data_type, SensorReadingDB)
        .join(ProcessSensorDB, ProcessSensorDB.id == SensorReadingDB.sensor_id)
        .join(ProcessDB, ProcessDB.id == SensorReadingDB.process_id)
        .join(DepartmentDB, DepartmentDB.id == ProcessDB.department_id)
    )
    if process_id is not None:
        query = query.filter(SensorReadingDB.process_id == process_id)
    if start:
        query = query.filter(SensorReadingDB.recorded_at >= start)
    if end:
        query = query.filter(SensorReadingDB.recorded_at <= end)
    query = query.order_by(SensorReadingDB.process_id, SensorReadingDB.recorded_at, ProcessSensorDB.id)
    rows = (
        [pid, code or "", name, department, sensor_id, sensor_name, data_type, _iso(reading.recorded_at), reading.value]
        for pid, code, name, department, sensor_id, sensor_name, data_type, reading in query.yield_per(5000)
    )
    return _csv_response(
        rows,
        ["process_id", "process_code", "process_name", "department", "sensor_id", "sensor_name", "data_type", "timestamp", "value"],
        "readings_long.csv",
    )

@router.get("/maintenance-logs.csv")
def export_maintenance_logs(process_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    query = db.query(MaintenanceLogDB, ProcessDB.code, ProcessDB.name).join(ProcessDB, ProcessDB.id == MaintenanceLogDB.process_id)
    if process_id is not None:
        query = query.filter(MaintenanceLogDB.process_id == process_id)
    query = query.order_by(MaintenanceLogDB.performed_at)
    rows = (
        [log.id, log.process_id, code or "", name, _iso(log.performed_at), log.type, log.status,
         log.downtime_hours, log.technician or "", log.description]
        for log, code, name in query.yield_per(1000)
    )
    return _csv_response(
        rows,
        ["id", "process_id", "process_code", "process_name", "performed_at", "type", "status",
         "downtime_hours", "technician", "description"],
        "maintenance_logs.csv",
    )

@router.get("/processes.csv")
def export_processes(db: Session = Depends(get_db)):
    query = db.query(ProcessDB).order_by(ProcessDB.id)
    rows = (
        [p.id, p.code or "", p.name, p.type, p.department.name, p.status, p.capacity, p.quantity, p.scheduled_hours_30d]
        for p in query.yield_per(500)
    )
    return _csv_response(
        rows,
        ["id", "code", "name", "type", "department", "status", "capacity", "quantity", "scheduled_hours_30d"],
        "processes.csv",
    )


# --- Products and production history ---
@router.get("/products.csv")
def export_products(db: Session = Depends(get_db)):
    query = db.query(ProductDB).order_by(ProductDB.id)
    rows = (
        [p.id, p.reference, p.name, p.category or "", p.material or "", p.standard or "", p.unit, p.revision, p.status,
         p.step_count, p.process_count, p.run_count,
         "; ".join(f"{s.name}={s.value}{(' ' + s.unit) if s.unit else ''}" for s in p.specs)]
        for p in query
    )
    return _csv_response(
        rows,
        ["id", "reference", "name", "category", "material", "standard", "unit", "revision", "status",
         "steps", "processes", "runs", "specifications"],
        "products.csv",
    )

@router.get("/production-runs.csv")
def export_production_runs(product_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    query = db.query(ProductionRunDB, ProductDB.reference, ProductDB.name, ProductDB.unit).join(
        ProductDB, ProductDB.id == ProductionRunDB.product_id
    )
    if product_id is not None:
        query = query.filter(ProductionRunDB.product_id == product_id)
    query = query.order_by(ProductionRunDB.started_at)
    rows = (
        [run.id, run.product_id, reference, name, unit, run.batch_number, run.customer_order or "",
         _iso(run.started_at), _iso(run.ended_at), round(run.lead_time_hours, 4), run.quantity_produced,
         run.quantity_scrap, run.yield_pct if run.yield_pct is not None else "", run.notes or ""]
        for run, reference, name, unit in query
    )
    return _csv_response(
        rows,
        ["run_id", "product_id", "product_reference", "product_name", "unit", "batch_number", "customer_order",
         "started_at", "ended_at", "lead_time_hours", "quantity_produced", "quantity_scrap", "yield_pct", "notes"],
        "production_runs.csv",
    )

@router.get("/production-run-steps.csv")
def export_production_run_steps(product_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    """One row per executed operation: the main training table for process-time and yield models."""
    query = (
        db.query(ProductionRunStepDB, ProductionRunDB, ProductDB.reference, ProcessDB.code, ProcessDB.name,
                 ProcessDB.type, DepartmentDB.name)
        .join(ProductionRunDB, ProductionRunDB.id == ProductionRunStepDB.run_id)
        .join(ProductDB, ProductDB.id == ProductionRunDB.product_id)
        .join(ProcessDB, ProcessDB.id == ProductionRunStepDB.process_id)
        .join(DepartmentDB, DepartmentDB.id == ProcessDB.department_id)
    )
    if product_id is not None:
        query = query.filter(ProductionRunDB.product_id == product_id)
    query = query.order_by(ProductionRunStepDB.started_at)
    rows = (
        [step.id, run.id, run.batch_number, reference, step.product_step_id or "", step.step_name, step.process_id,
         code or "", pname, ptype, department, step.instance or "", _iso(step.started_at), _iso(step.ended_at),
         round(step.duration_minutes, 3), step.quantity_in, step.quantity_out, step.quantity_scrap,
         step.operator or "", step.notes or ""]
        for step, run, reference, code, pname, ptype, department in query.yield_per(2000)
    )
    return _csv_response(
        rows,
        ["step_execution_id", "run_id", "batch_number", "product_reference", "product_step_id", "step_name",
         "process_id", "process_code", "process_name", "process_type", "department", "instance", "started_at",
         "ended_at", "duration_minutes", "quantity_in", "quantity_out", "quantity_scrap", "operator", "notes"],
        "production_run_steps.csv",
    )
