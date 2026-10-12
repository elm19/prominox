"""RRT: real-time reception of sensor data pushed by Node-RED."""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.process import ProcessDB
from app.schemas.process_data import ReadingError, ReadingRow, ReadingsCreate
from app.schemas.rrt import RrtConfig
import app.crud.process as crud_process

MAX_ROWS_PER_REQUEST = 1000
TIMESTAMP_KEYS = ("timestamp", "time", "ts")

class RrtError(Exception):
    """The machine cannot receive data (wrong state); `status_code` is the HTTP status to answer with."""
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code

def ingest_path(process: ProcessDB) -> str | None:
    return f"/api/v1/ingest/{process.rrt_token}" if process.rrt_token else None

def get_config(process: ProcessDB) -> RrtConfig:
    return RrtConfig(
        enabled=process.rrt_enabled,
        ingest_path=ingest_path(process),
        token=process.rrt_token,
        enabled_at=process.rrt_enabled_at,
        last_received_at=process.rrt_last_received_at,
        last_error=process.rrt_last_error,
        last_error_at=process.rrt_last_error_at,
    )

def get_by_token(db: Session, token: str) -> ProcessDB | None:
    return db.query(ProcessDB).filter(ProcessDB.rrt_token == token).first()

def _new_token(db: Session) -> str:
    while True:
        token = secrets.token_urlsafe(24)
        if not get_by_token(db, token):
            return token

def set_enabled(db: Session, process: ProcessDB, enabled: bool) -> ProcessDB:
    if enabled:
        if process.type != "machine":
            raise RrtError("RRT is only available for machines. Change the process type to 'machine' first.", 422)
        if not process.rrt_token:
            process.rrt_token = _new_token(db)  # the link is created the first time RRT is enabled
        if not process.rrt_enabled:
            process.rrt_enabled_at = datetime.now(timezone.utc)
    process.rrt_enabled = enabled
    db.commit()
    db.refresh(process)
    return process

def rotate_token(db: Session, process: ProcessDB) -> ProcessDB:
    process.rrt_token = _new_token(db)
    db.commit()
    db.refresh(process)
    return process

def _parse_timestamp(value: Any, fallback: datetime) -> datetime:
    if value is None or value == "":
        return fallback
    if isinstance(value, bool):
        raise ValueError("timestamp must be an ISO date or a unix time")
    if isinstance(value, (int, float)):
        seconds = value / 1000 if value > 1e11 else value  # Node-RED's Date.now() is in milliseconds
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    raise ValueError("timestamp must be an ISO date or a unix time")

def normalize(payload: Any) -> list[tuple[Any, dict]]:
    """Accepted bodies (all JSON):
      {"timestamp": ..., "values": {"Temp": 21.5}}        one reading
      {"Temp": 21.5, "Door": true}                        flat, timestamp optional
      {"readings": [ {...}, {...} ]}  or  [ {...}, {...} ] batch
    Returns [(timestamp or None, values)]."""
    if isinstance(payload, dict) and isinstance(payload.get("readings"), list):
        items = payload["readings"]
    elif isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = [payload]
    else:
        raise ValueError("The body must be a JSON object or array.")
    if not items:
        raise ValueError("No readings in the request.")
    if len(items) > MAX_ROWS_PER_REQUEST:
        raise ValueError(f"At most {MAX_ROWS_PER_REQUEST} readings per request.")
    rows = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"Reading {index + 1} must be a JSON object.")
        timestamp = next((item[key] for key in TIMESTAMP_KEYS if key in item), None)
        if isinstance(item.get("values"), dict):
            values = item["values"]
        else:
            values = {key: value for key, value in item.items() if key not in TIMESTAMP_KEYS}
        if not values:
            raise ValueError(f"Reading {index + 1} has no sensor values.")
        rows.append((timestamp, values))
    return rows

def _record_error(db: Session, process: ProcessDB, message: str) -> None:
    process.rrt_last_error = message[:500]
    process.rrt_last_error_at = datetime.now(timezone.utc)
    db.commit()

def ingest(db: Session, process: ProcessDB, payload: Any) -> tuple[int, int, datetime]:
    """Stores one request. All-or-nothing; raises crud_process.ReadingValidationError listing every problem."""
    now = datetime.now(timezone.utc)
    try:
        raw_rows = normalize(payload)
    except ValueError as exc:
        _record_error(db, process, str(exc))
        raise RrtError(str(exc), 422)

    by_name = {sensor.name: sensor for sensor in process.sensors}
    by_lower = {sensor.name.lower(): sensor for sensor in process.sensors}
    by_id = {str(sensor.id): sensor for sensor in process.sensors}
    known = ", ".join(sorted(by_name)) or "none defined"

    errors: list[ReadingError] = []
    rows: list[ReadingRow] = []
    for index, (raw_timestamp, raw_values) in enumerate(raw_rows):
        try:
            timestamp = _parse_timestamp(raw_timestamp, now + timedelta(microseconds=index))
        except (ValueError, OverflowError, OSError) as exc:
            errors.append(ReadingError(row=index, sensor_id="timestamp", value=raw_timestamp, message=f"Invalid timestamp: {exc}"))
            continue
        values: dict[str, Any] = {}
        for key, value in raw_values.items():
            sensor = by_name.get(key) or by_lower.get(str(key).lower()) or by_id.get(str(key))
            if sensor is None:
                errors.append(ReadingError(
                    row=index, sensor_id=str(key), value=value,
                    message=f"No sensor named '{key}' on this machine. Defined sensors: {known}",
                ))
            else:
                values[str(sensor.id)] = value
        rows.append(ReadingRow(timestamp=timestamp, values=values))
    if errors:
        _record_error(db, process, f"{len(errors)} invalid value(s), e.g. {errors[0].message}")
        raise crud_process.ReadingValidationError(errors)

    try:
        inserted = crud_process.add_readings(db, process, ReadingsCreate(readings=rows))
    except crud_process.ReadingValidationError as exc:
        _record_error(db, process, f"{len(exc.errors)} invalid value(s), e.g. {exc.errors[0].sensor_name}: {exc.errors[0].message}")
        raise
    process.rrt_last_received_at = now
    process.rrt_last_error = None
    process.rrt_last_error_at = None
    db.commit()
    return inserted, len(rows), now
