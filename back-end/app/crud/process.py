import math
from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.crud.process_image import upload_dir
from app.models.department import DepartmentDB
from app.models.process import ProcessDB
from app.models.process_data import PredictionSnapshotDB, ProcessSensorDB, SensorReadingDB
from app.schemas.process import MapLayoutUpdate, ProcessCreate, ProcessDetailResponse, ProcessUpdate
from app.schemas.process_data import (
    PredictionSnapshotResponse,
    ReadingError,
    ReadingRow,
    ReadingsCreate,
    SensorCreate,
    SensorDataType,
    SensorUpdate,
)

def get_process_by_id(db: Session, process_id: int) -> ProcessDB | None:
    return db.query(ProcessDB).filter(ProcessDB.id == process_id).first()

def get_process_by_code(db: Session, code: str) -> ProcessDB | None:
    return db.query(ProcessDB).filter(ProcessDB.code == code).first()

def get_all_processes(db: Session, skip: int = 0, limit: int = 100) -> list[ProcessDB]:
    return db.query(ProcessDB).order_by(ProcessDB.name).offset(skip).limit(limit).all()

def create_process(db: Session, process_data: ProcessCreate) -> ProcessDB:
    db_process = ProcessDB(
        name=process_data.name,
        type=process_data.type.value,
        description=process_data.description,
        capacity=process_data.capacity,
        quantity=process_data.quantity,
        code=process_data.code or None,
        status=process_data.status.value,
        department_id=process_data.department_id,
        position_x=process_data.position_x,
        position_y=process_data.position_y,
        scheduled_hours_30d=process_data.scheduled_hours_30d,
    )
    db.add(db_process)
    db.commit()
    db.refresh(db_process)
    return db_process

def update_process(db: Session, db_process: ProcessDB, data: ProcessUpdate) -> ProcessDB:
    changes = data.model_dump(exclude_unset=True)
    for required in ("name", "type", "capacity", "quantity", "status", "department_id"):
        if required in changes and changes[required] is None:
            changes.pop(required)  # these columns are NOT NULL: null means "unchanged"
    # Moving to another department: the old position is relative to the old box, so reset it
    if changes.get("department_id") not in (None, db_process.department_id) and "position_x" not in changes:
        changes["position_x"] = None
        changes["position_y"] = None
    if "code" in changes:
        changes["code"] = changes["code"] or None
    if changes.get("type") == "manual":
        changes["rrt_enabled"] = False  # RRT is for machines only
    for field, value in changes.items():
        setattr(db_process, field, value.value if hasattr(value, "value") else value)
    db.commit()
    db.refresh(db_process)
    return db_process

def update_layout(db: Session, layout: MapLayoutUpdate) -> None:
    for item in layout.departments:
        department = db.get(DepartmentDB, item.id)
        if department:
            department.position_x, department.position_y = item.position_x, item.position_y
    for item in layout.processes:
        process = db.get(ProcessDB, item.id)
        if process:
            process.position_x, process.position_y = item.position_x, item.position_y
    db.commit()

def delete_process(db: Session, db_process: ProcessDB) -> None:
    stored_names = [image.stored_name for image in db_process.images]
    db.delete(db_process)
    db.commit()
    for stored_name in stored_names:
        (upload_dir() / stored_name).unlink(missing_ok=True)

# --- Sensors ---
def get_sensor(db: Session, process_id: int, sensor_id: int) -> ProcessSensorDB | None:
    return (
        db.query(ProcessSensorDB)
        .filter(ProcessSensorDB.process_id == process_id, ProcessSensorDB.id == sensor_id)
        .first()
    )

def get_sensor_by_name(db: Session, process_id: int, name: str) -> ProcessSensorDB | None:
    return (
        db.query(ProcessSensorDB)
        .filter(ProcessSensorDB.process_id == process_id, ProcessSensorDB.name == name)
        .first()
    )

def add_sensor(db: Session, process_id: int, data: SensorCreate) -> ProcessSensorDB:
    sensor = ProcessSensorDB(
        process_id=process_id, name=data.name, data_type=data.data_type.value, description=data.description
    )
    db.add(sensor)
    db.commit()
    db.refresh(sensor)
    return sensor

def update_sensor(db: Session, sensor: ProcessSensorDB, data: SensorUpdate) -> ProcessSensorDB:
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "name" and value is None:
            continue
        setattr(sensor, field, value.strip() if field == "name" else value)
    db.commit()
    db.refresh(sensor)
    return sensor

def delete_sensor(db: Session, sensor: ProcessSensorDB) -> None:
    db.delete(sensor)
    db.commit()

# --- Readings ---
class ReadingValidationError(Exception):
    def __init__(self, errors: list[ReadingError]):
        self.errors = errors

def _check_value(data_type: str, value) -> str | None:
    """Returns an error message when `value` does not match the declared type (no coercion)."""
    if data_type == SensorDataType.number.value:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            return "expected a number"
    elif data_type == SensorDataType.boolean.value:
        if not isinstance(value, bool):
            return "expected true or false"
    elif data_type == SensorDataType.text.value:
        if not isinstance(value, str):
            return "expected text (a string)"
    return None

def add_readings(db: Session, db_process: ProcessDB, data: ReadingsCreate) -> int:
    """All-or-nothing: if any value is invalid, raises ReadingValidationError and stores nothing."""
    sensors = {str(s.id): s for s in db_process.sensors}
    errors: list[ReadingError] = []
    for index, row in enumerate(data.readings):
        for sensor_id, value in row.values.items():
            sensor = sensors.get(sensor_id)
            if sensor is None:
                errors.append(ReadingError(
                    row=index, sensor_id=sensor_id, value=value,
                    message=f"Sensor {sensor_id} does not exist on process {db_process.id}",
                ))
                continue
            problem = _check_value(sensor.data_type, value)
            if problem:
                errors.append(ReadingError(
                    row=index, sensor_id=sensor_id, sensor_name=sensor.name, value=value,
                    expected=SensorDataType(sensor.data_type), message=problem,
                ))
    if errors:
        raise ReadingValidationError(errors)

    inserted = 0
    for row in data.readings:
        for sensor_id, value in row.values.items():
            sensor = sensors[sensor_id]
            columns = {"value_number": None, "value_text": None, "value_bool": None}
            if sensor.data_type == SensorDataType.number.value:
                columns["value_number"] = float(value)
            elif sensor.data_type == SensorDataType.boolean.value:
                columns["value_bool"] = value
            else:
                columns["value_text"] = value
            existing = (
                db.query(SensorReadingDB)
                .filter(SensorReadingDB.sensor_id == sensor.id, SensorReadingDB.recorded_at == row.timestamp)
                .first()
            )
            if existing:
                for key, val in columns.items():
                    setattr(existing, key, val)
            else:
                db.add(SensorReadingDB(
                    process_id=db_process.id, sensor_id=sensor.id, recorded_at=row.timestamp, **columns
                ))
            inserted += 1
    db_process.last_update = datetime.now(timezone.utc)
    db.commit()
    return inserted

def get_readings_wide(
    db: Session, db_process: ProcessDB, start: datetime | None = None, end: datetime | None = None,
    limit: int | None = None,
) -> list[ReadingRow]:
    """Pivot long readings into one row per timestamp. With `limit`, keeps the newest N timestamps."""
    query = db.query(SensorReadingDB).filter(SensorReadingDB.process_id == db_process.id)
    if start:
        query = query.filter(SensorReadingDB.recorded_at >= start)
    if end:
        query = query.filter(SensorReadingDB.recorded_at <= end)
    if limit:
        stamps = (
            db.query(SensorReadingDB.recorded_at)
            .filter(SensorReadingDB.process_id == db_process.id)
            .distinct()
            .order_by(SensorReadingDB.recorded_at.desc())
            .limit(limit)
            .subquery()
        )
        query = query.filter(SensorReadingDB.recorded_at.in_(db.query(stamps.c.recorded_at)))
    rows: dict[datetime, dict[str, object]] = {}
    for reading in query.order_by(SensorReadingDB.recorded_at):
        rows.setdefault(reading.recorded_at, {})[str(reading.sensor_id)] = reading.value
    return [ReadingRow(timestamp=ts, values=vals) for ts, vals in rows.items()]

# --- Detail view ---
def get_latest_snapshot(db: Session, process_id: int) -> PredictionSnapshotDB | None:
    return (
        db.query(PredictionSnapshotDB)
        .filter(PredictionSnapshotDB.process_id == process_id, PredictionSnapshotDB.is_latest.is_(True))
        .order_by(PredictionSnapshotDB.last_prediction_date.desc())
        .first()
    )

def build_process_detail(db: Session, db_process: ProcessDB, readings_limit: int = 500) -> ProcessDetailResponse:
    detail = ProcessDetailResponse.model_validate(db_process, from_attributes=True)
    detail.sensor_data = get_readings_wide(db, db_process, limit=readings_limit)
    snapshot = get_latest_snapshot(db, db_process.id)
    if snapshot:
        detail.latest_prediction = PredictionSnapshotResponse.model_validate(snapshot, from_attributes=True)
    return detail

def get_all_process_details(db: Session, readings_limit: int = 500) -> list[ProcessDetailResponse]:
    processes = (
        db.query(ProcessDB)
        .options(
            joinedload(ProcessDB.department),
            joinedload(ProcessDB.sensors),
            joinedload(ProcessDB.images),
            joinedload(ProcessDB.maintenance_logs),
        )
        .order_by(ProcessDB.name)
        .all()
    )
    return [build_process_detail(db, p, readings_limit) for p in processes]
