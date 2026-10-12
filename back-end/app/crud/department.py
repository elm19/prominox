from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.department import DepartmentDB
from app.schemas.department import DepartmentCreate, DepartmentUpdate

def get_department_by_id(db: Session, department_id: int) -> DepartmentDB | None:
    return db.query(DepartmentDB).filter(DepartmentDB.id == department_id).first()

def get_department_by_name(db: Session, name: str) -> DepartmentDB | None:
    return db.query(DepartmentDB).filter(func.lower(DepartmentDB.name) == name.lower()).first()

def get_all_departments(db: Session) -> list[DepartmentDB]:
    return db.query(DepartmentDB).order_by(DepartmentDB.name).all()

def create_department(db: Session, data: DepartmentCreate) -> DepartmentDB:
    db_department = DepartmentDB(name=data.name, description=data.description)
    db.add(db_department)
    db.commit()
    db.refresh(db_department)
    return db_department

def update_department(db: Session, db_department: DepartmentDB, data: DepartmentUpdate) -> DepartmentDB:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(db_department, field, value)
    db.commit()
    db.refresh(db_department)
    return db_department

def delete_department(db: Session, db_department: DepartmentDB) -> None:
    db.delete(db_department)
    db.commit()
