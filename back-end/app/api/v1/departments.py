from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database import get_db
from app.schemas.department import DepartmentCreate, DepartmentResponse, DepartmentUpdate
import app.crud.department as crud_department

router = APIRouter(prefix="/departments", tags=["Departments"])

def _get_or_404(db: Session, department_id: int):
    department = crud_department.get_department_by_id(db, department_id=department_id)
    if not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Department with ID {department_id} not found")
    return department

def _check_name_free(db: Session, name: str, own_id: Optional[int] = None):
    other = crud_department.get_department_by_name(db, name)
    if other and other.id != own_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Department '{other.name}' already exists")

@router.get("", response_model=List[DepartmentResponse] | DepartmentResponse)
def read_departments(
    department_id: Optional[int] = Query(None, description="Optional ID to fetch a single department"),
    db: Session = Depends(get_db)
):
    if department_id is not None:
        return _get_or_404(db, department_id)
    return crud_department.get_all_departments(db)

@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_new_department(department: DepartmentCreate, db: Session = Depends(get_db)):
    _check_name_free(db, department.name)
    return crud_department.create_department(db=db, data=department)

@router.patch("/{department_id}", response_model=DepartmentResponse)
def update_existing_department(department_id: int, data: DepartmentUpdate, db: Session = Depends(get_db)):
    department = _get_or_404(db, department_id)
    if data.name:
        _check_name_free(db, data.name, own_id=department_id)
    return crud_department.update_department(db, department, data)

@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_existing_department(department_id: int, db: Session = Depends(get_db)):
    department = _get_or_404(db, department_id)
    if department.process_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Department '{department.name}' still has {department.process_count} process(es). "
                "Move or delete them before deleting the department."
            ),
        )
    crud_department.delete_department(db, department)
