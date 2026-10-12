from sqlalchemy.orm import Session, joinedload, selectinload

from app.crud.product_file import upload_dir
from app.models.product import ProductDB, ProductSpecDB, ProductStepDB
from app.schemas.product import (
    FlowEdge, ProductCreate, ProductDetail, ProductFlow, ProductStats, ProductUpdate, StepCreate, StepUpdate,
)

PALETTE = ["#38bdf8", "#f59e0b", "#34d399", "#a78bfa", "#fb7185", "#14b8a6", "#f97316", "#facc15"]

# --- Products ---
def _loaded(db: Session):
    return db.query(ProductDB).options(
        selectinload(ProductDB.specs),
        selectinload(ProductDB.files),
        selectinload(ProductDB.runs),
        selectinload(ProductDB.steps).selectinload(ProductStepDB.process),
        selectinload(ProductDB.steps).selectinload(ProductStepDB.depends_on),
        selectinload(ProductDB.steps).selectinload(ProductStepDB.required_for_steps),
    )

def get_product_by_id(db: Session, product_id: int) -> ProductDB | None:
    return _loaded(db).filter(ProductDB.id == product_id).first()

def get_product_by_reference(db: Session, reference: str) -> ProductDB | None:
    return db.query(ProductDB).filter(ProductDB.reference == reference).first()

def get_all_products(db: Session, skip: int = 0, limit: int = 500) -> list[ProductDB]:
    return _loaded(db).order_by(ProductDB.name).offset(skip).limit(limit).all()

def create_product(db: Session, data: ProductCreate) -> ProductDB:
    color = data.color or PALETTE[db.query(ProductDB).count() % len(PALETTE)]
    product = ProductDB(
        reference=data.reference, name=data.name, description=data.description, category=data.category,
        material=data.material, standard=data.standard, unit=data.unit, revision=data.revision,
        status=data.status.value, color=color,
    )
    product.specs = [ProductSpecDB(name=s.name, value=s.value, unit=s.unit) for s in data.specifications]
    db.add(product)
    db.commit()
    return get_product_by_id(db, product.id)

def update_product(db: Session, product: ProductDB, data: ProductUpdate) -> ProductDB:
    changes = data.model_dump(exclude_unset=True)
    specs = changes.pop("specifications", None)
    for field in ("reference", "name", "unit", "revision", "status", "color"):
        if field in changes and changes[field] is None:
            changes.pop(field)  # NOT NULL columns: null means unchanged
    for field, value in changes.items():
        setattr(product, field, value.value if hasattr(value, "value") else value)
    if specs is not None:
        product.specs.clear()
        db.flush()
        product.specs.extend(ProductSpecDB(name=s["name"], value=s["value"], unit=s.get("unit")) for s in specs)
    db.commit()
    return get_product_by_id(db, product.id)

def delete_product(db: Session, product: ProductDB) -> None:
    stored = [file.stored_name for file in product.files]
    db.delete(product)
    db.commit()
    for name in stored:
        (upload_dir() / name).unlink(missing_ok=True)

def build_detail(product: ProductDB) -> ProductDetail:
    detail = ProductDetail.model_validate(product, from_attributes=True)
    runs = product.runs
    produced = sum(run.quantity_produced for run in runs)
    scrap = sum(run.quantity_scrap for run in runs)
    detail.stats = ProductStats(
        run_count=len(runs),
        total_produced=produced,
        total_scrap=scrap,
        yield_pct=round(produced / (produced + scrap) * 100, 2) if produced + scrap > 0 else None,
        avg_lead_time_hours=round(sum(run.lead_time_hours for run in runs) / len(runs), 2) if runs else None,
        last_run_at=max((run.started_at for run in runs), default=None),
    )
    return detail

# --- Steps ---
class StepError(Exception):
    """A routing rule was violated; the message is shown to the user."""

def _reaches(start: ProductStepDB, target_id: int) -> bool:
    """True if `target_id` can be reached from `start` by following 'depends on' links."""
    seen, stack = set(), [start]
    while stack:
        step = stack.pop()
        if step.id == target_id:
            return True
        if step.id in seen:
            continue
        seen.add(step.id)
        stack.extend(step.depends_on)
    return False

def _resolve_dependencies(product: ProductDB, step: ProductStepDB | None, ids: list[int]) -> list[ProductStepDB]:
    by_id = {s.id: s for s in product.steps}
    dependencies: list[ProductStepDB] = []
    for dep_id in dict.fromkeys(ids):  # de-duplicate, keep order
        dep = by_id.get(dep_id)
        if dep is None:
            raise StepError(f"Step {dep_id} does not belong to this product and cannot be a dependency.")
        if step is not None:
            if dep.id == step.id:
                raise StepError("A step cannot depend on itself.")
            if _reaches(dep, step.id):
                raise StepError(f"'{dep.name}' already depends on '{step.name}': this would create a cycle.")
        dependencies.append(dep)
    return dependencies

def add_step(db: Session, product: ProductDB, data: StepCreate) -> ProductStepDB:
    dependencies = _resolve_dependencies(product, None, data.depends_on_step_ids)  # a new step cannot be in a cycle
    step = ProductStepDB(
        product_id=product.id, process_id=data.process_id, name=data.name, description=data.description,
        standard_duration_minutes=data.standard_duration_minutes,
        sequence=max((s.sequence for s in product.steps), default=0) + 1,
    )
    step.depends_on = dependencies
    db.add(step)
    db.commit()
    db.refresh(step)
    return step

def update_step(db: Session, product: ProductDB, step: ProductStepDB, data: StepUpdate) -> ProductStepDB:
    changes = data.model_dump(exclude_unset=True)
    ids = changes.pop("depends_on_step_ids", None)
    if ids is not None:
        step.depends_on = _resolve_dependencies(product, step, ids)
    for field, value in changes.items():
        if field in ("name", "process_id") and value is None:
            continue
        setattr(step, field, value)
    db.commit()
    db.refresh(step)
    return step

def delete_step(db: Session, step: ProductStepDB) -> None:
    db.delete(step)
    db.commit()

def get_step(db: Session, product_id: int, step_id: int) -> ProductStepDB | None:
    return db.query(ProductStepDB).filter(ProductStepDB.product_id == product_id, ProductStepDB.id == step_id).first()

# --- Product flows for the map ---
def get_flows(db: Session, include_archived: bool = False) -> list[ProductFlow]:
    flows = []
    for product in get_all_products(db):
        if product.status == "archived" and not include_archived:
            continue
        process_of = {s.id: s.process_id for s in product.steps}
        edges = [
            FlowEdge(
                from_step_id=dep.id, to_step_id=step.id,
                source_process_id=process_of[dep.id], target_process_id=step.process_id,
            )
            for step in product.steps
            for dep in step.depends_on
            if process_of[dep.id] != step.process_id  # consecutive steps on one process need no arrow
        ]
        flows.append(ProductFlow(
            product_id=product.id, reference=product.reference, name=product.name, color=product.color,
            process_ids=sorted(set(process_of.values())), edges=edges,
            final_process_ids=sorted({step.process_id for step in product.steps if not step.required_for_steps}),
        ))
    return flows
