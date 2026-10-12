from datetime import datetime

from sqlalchemy.orm import Session, selectinload

from app.models.process import ProcessDB
from app.models.product import ProductDB
from app.models.production import ProductionRunDB, ProductionRunStepDB
from app.schemas.production import RunCreate, RunIssue, RunUpdate

class RunValidationError(Exception):
    def __init__(self, issues: list[RunIssue]):
        self.issues = issues

def get_run(db: Session, product_id: int, run_id: int) -> ProductionRunDB | None:
    return (
        db.query(ProductionRunDB)
        .options(selectinload(ProductionRunDB.steps))
        .filter(ProductionRunDB.product_id == product_id, ProductionRunDB.id == run_id)
        .first()
    )

def get_runs(db: Session, product_id: int | None = None) -> list[ProductionRunDB]:
    query = db.query(ProductionRunDB).options(selectinload(ProductionRunDB.steps))
    if product_id is not None:
        query = query.filter(ProductionRunDB.product_id == product_id)
    return query.order_by(ProductionRunDB.started_at.desc()).all()

def batch_exists(db: Session, product_id: int, batch_number: str, exclude_id: int | None = None) -> bool:
    query = db.query(ProductionRunDB).filter(
        ProductionRunDB.product_id == product_id, ProductionRunDB.batch_number == batch_number
    )
    if exclude_id is not None:
        query = query.filter(ProductionRunDB.id != exclude_id)
    return query.first() is not None

def create_run(db: Session, product: ProductDB, data: RunCreate) -> ProductionRunDB:
    """All-or-nothing: every problem in the submitted history is collected and reported together."""
    issues: list[RunIssue] = []
    routing = {step.id: step for step in product.steps}
    processes = {p.id: p for p in db.query(ProcessDB).all()}
    rows: list[ProductionRunStepDB] = []

    for index, item in enumerate(data.steps):
        def problem(field: str, message: str, value=None):
            issues.append(RunIssue(row=index, field=field, message=message, value=value))

        step = None
        if item.product_step_id is not None:
            step = routing.get(item.product_step_id)
            if step is None:
                problem("product_step_id", "This step does not belong to the product's routing", item.product_step_id)
        name = (item.step_name or "").strip() or (step.name if step else "")
        process_id = item.process_id or (step.process_id if step else None)
        process = processes.get(process_id) if process_id else None
        if process_id and process is None:
            problem("process_id", f"Process {process_id} does not exist", process_id)
        if process and item.instance and item.instance > process.quantity:
            problem("instance", f"'{process.name}' only has {process.quantity} instance(s)", item.instance)
        if item.started_at < data.started_at or item.ended_at > data.ended_at:
            problem("started_at", "The step must happen inside the run's start and end dates", item.started_at.isoformat())
        if name and process_id and process:
            rows.append(ProductionRunStepDB(
                product_step_id=step.id if step else None, step_name=name, process_id=process_id,
                instance=item.instance, started_at=item.started_at, ended_at=item.ended_at,
                quantity_in=item.quantity_in, quantity_out=item.quantity_out, quantity_scrap=item.quantity_scrap,
                operator=item.operator, notes=item.notes,
            ))
    if issues:
        raise RunValidationError(issues)

    run = ProductionRunDB(
        product_id=product.id, batch_number=data.batch_number, customer_order=data.customer_order,
        started_at=data.started_at, ended_at=data.ended_at, quantity_produced=data.quantity_produced,
        quantity_scrap=data.quantity_scrap, notes=data.notes,
    )
    run.steps = rows
    db.add(run)
    db.commit()
    return get_run(db, product.id, run.id)

def update_run(db: Session, run: ProductionRunDB, data: RunUpdate) -> ProductionRunDB:
    changes = data.model_dump(exclude_unset=True)
    for required in ("batch_number", "started_at", "ended_at", "quantity_produced", "quantity_scrap"):
        if required in changes and changes[required] is None:
            changes.pop(required)
    started = changes.get("started_at", run.started_at)
    ended = changes.get("ended_at", run.ended_at)
    if ended < started:
        raise RunValidationError([RunIssue(field="ended_at", message="ended_at must not be before started_at")])
    if any(step.started_at < started or step.ended_at > ended for step in run.steps):
        raise RunValidationError([RunIssue(field="started_at", message="Recorded steps fall outside the new run dates")])
    for field, value in changes.items():
        setattr(run, field, value.strip() if field == "batch_number" else value)
    db.commit()
    return get_run(db, run.product_id, run.id)

def delete_run(db: Session, run: ProductionRunDB) -> None:
    db.delete(run)
    db.commit()
