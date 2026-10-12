from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database import get_db
from app.schemas.process_data import MaintenanceLogCreate, MaintenanceLogResponse, MaintenanceLogUpdate
import app.crud.maintenance as crud_maintenance
import app.crud.process as crud_process

router = APIRouter(prefix="/maintenance-logs", tags=["Maintenance"])

@router.get("", response_model=List[MaintenanceLogResponse] | MaintenanceLogResponse)
def read_maintenance_logs(
    log_id: Optional[int] = Query(None, description="Optional ID to fetch a single log"),
    process_id: Optional[int] = Query(None, description="Only logs of this process"),
    db: Session = Depends(get_db)
):
    if log_id is not None:
        log = crud_maintenance.get_log_by_id(db, log_id=log_id)
        if not log:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Maintenance log with ID {log_id} not found")
        return log
    return crud_maintenance.get_logs(db, process_id=process_id)

@router.post("", response_model=MaintenanceLogResponse, status_code=status.HTTP_201_CREATED)
def create_new_log(log: MaintenanceLogCreate, db: Session = Depends(get_db)):
    if not crud_process.get_process_by_id(db, log.process_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Process with ID {log.process_id} not found")
    return crud_maintenance.create_log(db, log)

@router.patch("/{log_id}", response_model=MaintenanceLogResponse)
def update_existing_log(log_id: int, data: MaintenanceLogUpdate, db: Session = Depends(get_db)):
    log = crud_maintenance.get_log_by_id(db, log_id=log_id)
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Maintenance log with ID {log_id} not found")
    return crud_maintenance.update_log(db, log, data)
