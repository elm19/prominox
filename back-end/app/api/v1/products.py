from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.schemas.product import (
    ProductCreate, ProductDetail, ProductFileResponse, ProductFlow, ProductSummary, ProductUpdate,
    StepCreate, StepResponse, StepUpdate,
)
from app.schemas.production import RunCreate, RunDetail, RunSummary, RunUpdate
import app.crud.process as crud_process
import app.crud.product as crud_product
import app.crud.product_file as crud_file
import app.crud.production as crud_production

router = APIRouter(prefix="/products", tags=["Products"])

def _get_or_404(db: Session, product_id: int):
    product = crud_product.get_product_by_id(db, product_id=product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product with ID {product_id} not found")
    return product

def _check_reference(db: Session, reference: Optional[str], own_id: Optional[int] = None):
    if reference:
        other = crud_product.get_product_by_reference(db, reference.strip())
        if other and other.id != own_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Product reference '{other.reference}' already exists")

def _check_process(db: Session, process_id: Optional[int]):
    if process_id is not None and not crud_process.get_process_by_id(db, process_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Process with ID {process_id} not found")

# 1. READ Products (all as summaries, or a single detailed one by query param)
@router.get("", response_model=ProductDetail | List[ProductSummary])
def read_products(
    product_id: Optional[int] = Query(None, description="Optional ID to fetch one product with specs, files, routing and stats"),
    db: Session = Depends(get_db)
):
    if product_id is not None:
        return crud_product.build_detail(_get_or_404(db, product_id))
    return crud_product.get_all_products(db)

# Product flows for the factory map (one colour per product)
@router.get("/flows", response_model=List[ProductFlow])
def read_product_flows(include_archived: bool = False, db: Session = Depends(get_db)):
    return crud_product.get_flows(db, include_archived=include_archived)

# 2. CREATE / UPDATE / DELETE a product
@router.post("", response_model=ProductDetail, status_code=status.HTTP_201_CREATED)
def create_new_product(product: ProductCreate, db: Session = Depends(get_db)):
    _check_reference(db, product.reference)
    return crud_product.build_detail(crud_product.create_product(db=db, data=product))

@router.patch("/{product_id}", response_model=ProductDetail)
def update_existing_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db)):
    product = _get_or_404(db, product_id)
    _check_reference(db, data.reference, own_id=product_id)
    return crud_product.build_detail(crud_product.update_product(db, product, data))

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_existing_product(product_id: int, db: Session = Depends(get_db)):
    crud_product.delete_product(db, _get_or_404(db, product_id))

# 3. Routing steps
@router.post("/{product_id}/steps", response_model=StepResponse, status_code=status.HTTP_201_CREATED)
def add_step_to_product(product_id: int, step: StepCreate, db: Session = Depends(get_db)):
    product = _get_or_404(db, product_id)
    _check_process(db, step.process_id)
    try:
        return crud_product.add_step(db, product, step)
    except crud_product.StepError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

def _get_step_or_404(db: Session, product_id: int, step_id: int):
    step = crud_product.get_step(db, product_id, step_id)
    if not step:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Step with ID {step_id} not found on product {product_id}")
    return step

@router.patch("/{product_id}/steps/{step_id}", response_model=StepResponse)
def update_product_step(product_id: int, step_id: int, data: StepUpdate, db: Session = Depends(get_db)):
    product = _get_or_404(db, product_id)
    step = _get_step_or_404(db, product_id, step_id)
    _check_process(db, data.process_id)
    try:
        return crud_product.update_step(db, product, step, data)
    except crud_product.StepError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

@router.delete("/{product_id}/steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product_step(product_id: int, step_id: int, db: Session = Depends(get_db)):
    crud_product.delete_step(db, _get_step_or_404(db, product_id, step_id))

# 4. Files (images and PDFs)
@router.post("/{product_id}/files", response_model=List[ProductFileResponse], status_code=status.HTTP_201_CREATED)
async def upload_product_files(product_id: int, files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    _get_or_404(db, product_id)
    validated = []
    for file in files:
        name = file.filename or "file"
        data = await file.read(crud_file.MAX_PDF_BYTES + 1)
        content_type = crud_file.sniff_file_type(data)
        if content_type is None:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"'{name}' is not supported. Allowed: JPEG, PNG, WebP images and PDF documents.",
            )
        limit = crud_file.max_bytes(content_type)
        if len(data) > limit:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"'{name}' is larger than {limit // (1024 * 1024)} MB.",
            )
        validated.append((name, data, content_type))
    # Per-kind limits are checked for the whole batch before anything is stored
    for kind, label in (("image", "images"), ("pdf", "PDF documents")):
        incoming = sum(1 for _, _, ctype in validated if (ctype == "application/pdf") == (kind == "pdf"))
        if crud_file.count_by_kind(db, product_id, kind) + incoming > crud_file.MAX_FILES_PER_KIND:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"A product can have at most {crud_file.MAX_FILES_PER_KIND} {label}.",
            )
    return [crud_file.save_file(db, product_id, name, data, ctype) for name, data, ctype in validated]

@router.delete("/{product_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product_file(product_id: int, file_id: int, db: Session = Depends(get_db)):
    file = crud_file.get_file(db, product_id, file_id)
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File with ID {file_id} not found on product {product_id}")
    crud_file.delete_file(db, file)

# 5. Production history (past runs)
def _issues_response(exc: crud_production.RunValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": f"{len(exc.issues)} problem(s) in the production record; nothing was stored.",
            "errors": [issue.model_dump(mode="json") for issue in exc.issues],
        },
    )

def _get_run_or_404(db: Session, product_id: int, run_id: int):
    _get_or_404(db, product_id)
    run = crud_production.get_run(db, product_id, run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Production run with ID {run_id} not found on product {product_id}")
    return run

@router.get("/{product_id}/runs", response_model=List[RunSummary] | RunDetail)
def read_product_runs(
    product_id: int,
    run_id: Optional[int] = Query(None, description="Optional run ID to fetch one run with its step executions"),
    db: Session = Depends(get_db)
):
    if run_id is not None:
        return _get_run_or_404(db, product_id, run_id)
    _get_or_404(db, product_id)
    return crud_production.get_runs(db, product_id)

@router.post("/{product_id}/runs", response_model=RunDetail, status_code=status.HTTP_201_CREATED)
def record_production_run(product_id: int, run: RunCreate, db: Session = Depends(get_db)):
    product = _get_or_404(db, product_id)
    if crud_production.batch_exists(db, product_id, run.batch_number):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Batch '{run.batch_number}' is already recorded for this product")
    try:
        return crud_production.create_run(db, product, run)
    except crud_production.RunValidationError as exc:
        return _issues_response(exc)

@router.patch("/{product_id}/runs/{run_id}", response_model=RunDetail)
def update_production_run(product_id: int, run_id: int, data: RunUpdate, db: Session = Depends(get_db)):
    run = _get_run_or_404(db, product_id, run_id)
    if data.batch_number and crud_production.batch_exists(db, product_id, data.batch_number.strip(), exclude_id=run_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Batch '{data.batch_number}' is already recorded for this product")
    try:
        return crud_production.update_run(db, run, data)
    except crud_production.RunValidationError as exc:
        return _issues_response(exc)

@router.delete("/{product_id}/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_production_run(product_id: int, run_id: int, db: Session = Depends(get_db)):
    crud_production.delete_run(db, _get_run_or_404(db, product_id, run_id))
