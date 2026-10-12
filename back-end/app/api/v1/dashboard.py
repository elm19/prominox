from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.process import DashboardResponse
import app.crud.department as crud_department
import app.crud.maintenance as crud_maintenance
import app.crud.process as crud_process

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("", response_model=DashboardResponse)
def read_dashboard(
    readings_limit: int = Query(500, ge=1, le=10000, description="Newest N reading timestamps per process"),
    db: Session = Depends(get_db)
):
    return DashboardResponse(
        processes=crud_process.get_all_process_details(db, readings_limit=readings_limit),
        departments=crud_department.get_all_departments(db),
        recent_maintenance=crud_maintenance.get_logs(db, limit=5),
    )
