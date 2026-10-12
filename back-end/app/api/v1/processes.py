from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database import get_db
from app.schemas.process import (
    MapLayoutUpdate, ProcessCreate, ProcessDetailResponse, ProcessResponse, ProcessUpdate,
)
from app.schemas.process_data import (
    ReadingRow, ReadingsCreate, ReadingsCreated, SensorCreate, SensorResponse, SensorUpdate,
)
from app.schemas.process_image import ProcessImageResponse
import app.crud.department as crud_department
import app.crud.process as crud_process
import app.crud.process_image as crud_image
import app.crud.rrt as crud_rrt
from app.schemas.rrt import LiveResponse, LiveStatus, RrtConfig, RrtToggle
from datetime import timezone

router = APIRouter(prefix="/processes", tags=["Processes"])
map_router = APIRouter(prefix="/map", tags=["Factory map"])

def _get_or_404(db: Session, process_id: int):
    process = crud_process.get_process_by_id(db, process_id=process_id)
    if not process:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Process with ID {process_id} not found"
        )
    return process

def _check_refs(db: Session, department_id: Optional[int], code: Optional[str], own_id: Optional[int] = None):
    if department_id is not None and not crud_department.get_department_by_id(db, department_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Department with ID {department_id} not found")
    if code:
        other = crud_process.get_process_by_code(db, code)
        if other and other.id != own_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Process code '{code}' already exists")

# --- API 1: READ (ALL or BY ID via Query Param) ---
@router.get("", response_model=ProcessDetailResponse | List[ProcessResponse])
def read_processes(
    process_id: Optional[int] = Query(None, description="Optional ID to fetch a single process with sensors, readings, images and logs"),
    db: Session = Depends(get_db)
):
    if process_id is not None:
        return crud_process.build_process_detail(db, _get_or_404(db, process_id))

    return crud_process.get_all_processes(db)


# --- API 2: CREATE ---
@router.post("", response_model=ProcessResponse, status_code=status.HTTP_201_CREATED)
def create_new_process(
    process: ProcessCreate,
    db: Session = Depends(get_db)
):
    _check_refs(db, process.department_id, process.code)
    return crud_process.create_process(db=db, process_data=process)


# --- API 3: UPDATE / DELETE one process ---
@router.patch("/{process_id}", response_model=ProcessResponse)
def update_existing_process(process_id: int, data: ProcessUpdate, db: Session = Depends(get_db)):
    process = _get_or_404(db, process_id)
    _check_refs(db, data.department_id, data.code, own_id=process_id)
    return crud_process.update_process(db, process, data)

@router.delete("/{process_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_existing_process(process_id: int, db: Session = Depends(get_db)):
    process = _get_or_404(db, process_id)
    try:
        crud_process.delete_process(db, process)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This process is used by product routings or production history and cannot be deleted. Remove it from the products first, or set it to inactive instead.",
        )


# --- Sensors (user-defined) ---
@router.get("/{process_id}/sensors", response_model=List[SensorResponse])
def read_process_sensors(process_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, process_id).sensors

@router.post("/{process_id}/sensors", response_model=SensorResponse, status_code=status.HTTP_201_CREATED)
def add_sensor_to_process(process_id: int, sensor: SensorCreate, db: Session = Depends(get_db)):
    _get_or_404(db, process_id)
    if crud_process.get_sensor_by_name(db, process_id, sensor.name):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Sensor '{sensor.name}' already exists on this process")
    return crud_process.add_sensor(db, process_id, sensor)

def _get_sensor_or_404(db: Session, process_id: int, sensor_id: int):
    _get_or_404(db, process_id)
    sensor = crud_process.get_sensor(db, process_id, sensor_id)
    if not sensor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Sensor with ID {sensor_id} not found on process {process_id}")
    return sensor

@router.patch("/{process_id}/sensors/{sensor_id}", response_model=SensorResponse)
def update_process_sensor(process_id: int, sensor_id: int, data: SensorUpdate, db: Session = Depends(get_db)):
    sensor = _get_sensor_or_404(db, process_id, sensor_id)
    if data.name:
        other = crud_process.get_sensor_by_name(db, process_id, data.name.strip())
        if other and other.id != sensor_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Sensor '{data.name}' already exists on this process")
    return crud_process.update_sensor(db, sensor, data)

@router.delete("/{process_id}/sensors/{sensor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_process_sensor(process_id: int, sensor_id: int, db: Session = Depends(get_db)):
    crud_process.delete_sensor(db, _get_sensor_or_404(db, process_id, sensor_id))


# --- Sensor readings (wide format, keyed by sensor id) ---
@router.get("/{process_id}/readings", response_model=List[ReadingRow])
def read_process_readings(
    process_id: int,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: Optional[int] = Query(None, ge=1, le=100000, description="Keep only the newest N timestamps"),
    db: Session = Depends(get_db)
):
    return crud_process.get_readings_wide(db, _get_or_404(db, process_id), start=start, end=end, limit=limit)

@router.post("/{process_id}/readings", response_model=ReadingsCreated, status_code=status.HTTP_201_CREATED)
def add_process_readings(process_id: int, payload: ReadingsCreate, db: Session = Depends(get_db)):
    try:
        inserted = crud_process.add_readings(db, _get_or_404(db, process_id), payload)
    except crud_process.ReadingValidationError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": f"{len(exc.errors)} invalid value(s); nothing was stored.",
                "errors": [error.model_dump(mode="json") for error in exc.errors],
            },
        )
    return ReadingsCreated(inserted=inserted)


# --- RRT: real-time reception from Node-RED ---
@router.get("/{process_id}/rrt", response_model=RrtConfig)
def read_rrt_config(process_id: int, db: Session = Depends(get_db)):
    return crud_rrt.get_config(_get_or_404(db, process_id))

@router.put("/{process_id}/rrt", response_model=RrtConfig)
def set_rrt_enabled(process_id: int, toggle: RrtToggle, db: Session = Depends(get_db)):
    process = _get_or_404(db, process_id)
    try:
        return crud_rrt.get_config(crud_rrt.set_enabled(db, process, toggle.enabled))
    except crud_rrt.RrtError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

@router.post("/{process_id}/rrt/rotate-token", response_model=RrtConfig)
def rotate_rrt_token(process_id: int, db: Session = Depends(get_db)):
    """Creates a new ingestion link; the old one stops working immediately."""
    process = _get_or_404(db, process_id)
    if not process.rrt_token:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RRT has never been enabled for this machine")
    return crud_rrt.get_config(crud_rrt.rotate_token(db, process))

@router.get("/{process_id}/live", response_model=LiveResponse)
def read_live_data(
    process_id: int,
    since: Optional[datetime] = Query(None, description="Return readings at or after this time (poll with the newest timestamp you have)"),
    limit: int = Query(200, ge=1, le=5000, description="Newest N timestamps when `since` is not given"),
    db: Session = Depends(get_db)
):
    """Polling endpoint behind the live charts: new readings plus the RRT connection status."""
    process = _get_or_404(db, process_id)
    if since is not None and since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    readings = crud_process.get_readings_wide(db, process, start=since, limit=None if since else limit)
    return LiveResponse(
        rrt=LiveStatus(
            enabled=process.rrt_enabled,
            last_received_at=process.rrt_last_received_at,
            last_error=process.rrt_last_error,
            last_error_at=process.rrt_last_error_at,
        ),
        readings=readings,
        server_time=datetime.now(timezone.utc),
    )


# --- Images ---
@router.post("/{process_id}/images", response_model=List[ProcessImageResponse], status_code=status.HTTP_201_CREATED)
async def upload_process_images(process_id: int, files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    _get_or_404(db, process_id)
    if crud_image.count_images(db, process_id) + len(files) > crud_image.MAX_IMAGES_PER_PROCESS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"A process can have at most {crud_image.MAX_IMAGES_PER_PROCESS} images.",
        )
    # Validate every file before storing any
    validated = []
    for file in files:
        data = await file.read(crud_image.MAX_IMAGE_BYTES + 1)
        name = file.filename or "image"
        if len(data) > crud_image.MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"'{name}' is larger than {crud_image.MAX_IMAGE_BYTES // (1024 * 1024)} MB.",
            )
        content_type = crud_image.sniff_content_type(data)
        if content_type is None:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"'{name}' is not a supported image. Allowed: JPEG, PNG, WebP.",
            )
        validated.append((name, data, content_type))
    return [crud_image.save_image(db, process_id, name, data, ctype) for name, data, ctype in validated]

@router.delete("/{process_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_process_image(process_id: int, image_id: int, db: Session = Depends(get_db)):
    image = crud_image.get_image(db, process_id, image_id)
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Image with ID {image_id} not found on process {process_id}")
    crud_image.delete_image(db, image)


# --- Factory map layout (department boxes + process positions), saved in one transaction ---
@map_router.patch("/layout", status_code=status.HTTP_204_NO_CONTENT)
def save_map_layout(layout: MapLayoutUpdate, db: Session = Depends(get_db)):
    crud_process.update_layout(db, layout)
