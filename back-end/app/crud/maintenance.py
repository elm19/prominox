from sqlalchemy.orm import Session
from app.models.process_data import MaintenanceLogDB
from app.schemas.process_data import MaintenanceLogCreate, MaintenanceLogUpdate

def get_log_by_id(db: Session, log_id: int) -> MaintenanceLogDB | None:
    return db.query(MaintenanceLogDB).filter(MaintenanceLogDB.id == log_id).first()

def get_logs(db: Session, process_id: int | None = None, skip: int = 0, limit: int = 500) -> list[MaintenanceLogDB]:
    query = db.query(MaintenanceLogDB)
    if process_id is not None:
        query = query.filter(MaintenanceLogDB.process_id == process_id)
    return query.order_by(MaintenanceLogDB.performed_at.desc()).offset(skip).limit(limit).all()

def create_log(db: Session, data: MaintenanceLogCreate) -> MaintenanceLogDB:
    db_log = MaintenanceLogDB(
        process_id=data.process_id,
        performed_at=data.performed_at,
        type=data.type.value,
        description=data.description,
        status=data.status.value,
        downtime_hours=data.downtime_hours,
        technician=data.technician,
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

def update_log(db: Session, db_log: MaintenanceLogDB, data: MaintenanceLogUpdate) -> MaintenanceLogDB:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(db_log, field, value.value if hasattr(value, "value") else value)
    db.commit()
    db.refresh(db_log)
    return db_log
