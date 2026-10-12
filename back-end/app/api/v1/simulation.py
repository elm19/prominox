"""Production simulation: can these orders be made with the current processes, and how long would it take?"""
import dataclasses
import random
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.process import ProcessDB
from app.models.product import ProductDB, ProductStepDB
from app.schemas import simulation as schemas
from app.simulation import engine, strategies

router = APIRouter(prefix="/simulation", tags=["Simulation"])

MAX_TASKS = 30000
MC_BUDGET = 400_000  # operations simulated across all Monte Carlo replications


def _steps(product: ProductDB) -> list[engine.StepSpec]:
    return [
        engine.StepSpec(id=s.id, name=s.name, process_id=s.process_id, minutes=s.standard_duration_minutes or 0.0, deps=[d.id for d in s.depends_on])
        for s in product.steps
    ]


@router.get("/catalog", response_model=schemas.SimulationCatalog)
def catalog(db: Session = Depends(get_db)):
    processes = db.query(ProcessDB).order_by(ProcessDB.name).all()
    spec = {p.id: engine.ProcessSpec(p.id, p.name, p.code, p.status, p.capacity, p.quantity, p.status == "active") for p in processes}
    products = (
        db.query(ProductDB)
        .options(selectinload(ProductDB.steps).selectinload(ProductStepDB.depends_on), selectinload(ProductDB.steps).selectinload(ProductStepDB.process))
        .order_by(ProductDB.name)
        .all()
    )
    return schemas.SimulationCatalog(
        products=[
            schemas.SimProduct(
                id=p.id, reference=p.reference, name=p.name, unit=p.unit, status=p.status, step_count=len(p.steps),
                process_ids=sorted({s.process_id for s in p.steps}), minutes_per_unit=engine.critical_path(_steps(p), spec, 0.0),
            )
            for p in products
        ],
        processes=[schemas.SimProcess(id=p.id, name=p.name, code=p.code, status=p.status, capacity=p.capacity, quantity=p.quantity) for p in processes],
    )


@router.post("/run", response_model=schemas.SimulationResponse)
def run(body: schemas.SimulationRequest, db: Session = Depends(get_db)):
    processes = {
        p.id: engine.ProcessSpec(p.id, p.name, p.code, p.status, p.capacity, p.quantity, p.status == "active", parallel=body.capacity_mode == "parallel")
        for p in db.query(ProcessDB).all()
    }
    for override in body.overrides:
        process = processes.get(override.process_id)
        if process is None:
            continue
        if override.enabled is not None:
            process.enabled = override.enabled
        if override.instances is not None:
            process.instances = override.instances

    products: dict[int, ProductDB] = {}
    for item in body.orders:
        product = products.get(item.product_id) or db.get(ProductDB, item.product_id)
        if product is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Product {item.product_id} not found")
        products[item.product_id] = product
        if not product.steps:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{product.reference} has no routing steps yet")

    specs = [engine.OrderSpec(i.product_id, i.quantity, _steps(products[i.product_id])) for i in body.orders]
    warnings: list[str] = []
    for product in products.values():
        missing = [s.name for s in product.steps if not s.standard_duration_minutes]
        if missing:
            warnings.append(f"{product.reference}: no standard time on {', '.join(missing)} (counted as 0 minutes)")

    blocked = [engine.blockers(o, processes) for o in specs]
    runnable = [i for i, b in enumerate(blocked) if not b]
    sim_orders = [specs[i] for i in runnable]
    tasks = sum(o.quantity * len(o.steps) for o in sim_orders)
    if tasks > MAX_TASKS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"This is too large to simulate ({tasks:,} operations, limit {MAX_TASKS:,}). Use smaller quantities.")

    seed = body.seed if body.seed is not None else random.randrange(1, 10**9)
    sigma = body.variability_pct / 100
    transfer = body.transfer_minutes
    result = None
    monte = None
    metrics = None
    comparison: list[schemas.StrategyRow] = []
    optimization = None
    advice: list[schemas.CapacityAdvice] = []
    strategy = body.strategy
    if sim_orders:
        searchable = tasks <= strategies.MAX_SEARCH_TASKS
        if not searchable and (strategy == "optimized" or body.compare):
            warnings.append(f"Strategy search and comparison are skipped above {strategies.MAX_SEARCH_TASKS:,} operations; using 'most work remaining first'.")
            if strategy == "optimized":
                strategy = "remaining"
        outcome = strategies.optimize(sim_orders, processes, transfer, seed) if searchable and (strategy == "optimized" or body.compare) else None

        def priority_of(name: str):
            if name == "optimized":
                return strategies.genome_priority(outcome.genome)
            return strategies.rule_priority(name, sim_orders, transfer)

        bound = engine.lower_bound(sim_orders, processes, transfer)
        chosen = priority_of(strategy)
        result = engine.simulate(sim_orders, processes, transfer, sigma, random.Random(seed), record=True, priority=chosen)
        metrics = schemas.RunMetrics(**engine.metrics(result, sim_orders, processes, bound))
        expected = engine.simulate(sim_orders, processes, transfer, 0.0, random.Random(0), record=False, priority=chosen).makespan

        def typical(priority, reps: int):
            spans = sorted(
                engine.simulate(sim_orders, processes, transfer, sigma, random.Random(seed + 1 + k), record=False, priority=priority).makespan
                for k in range(reps)
            )
            return spans[len(spans) // 2], spans[min(len(spans) - 1, int(len(spans) * 0.9))], spans

        reps = min(body.replications, max(0, MC_BUDGET // max(tasks, 1)))
        if reps >= 2 and sigma > 0:
            p50, p90, spans = typical(chosen, reps)
            monte = schemas.MonteCarlo(runs=reps, expected=expected, min=spans[0], p50=p50, p90=p90, max=spans[-1])
        else:
            monte = schemas.MonteCarlo(runs=1, expected=expected, min=expected, p50=expected, p90=expected, max=expected)

        # What would one more instance of the busiest processes buy? (the only lever once scheduling is near its limit)
        busy = sorted(
            ((pid, st.busy / (processes[pid].slots * result.makespan) * 100) for pid, st in result.stats.items() if processes[pid].slots and st.tasks and result.makespan > 0),
            key=lambda item: -item[1],
        )[:2]
        for pid, utilization in busy:
            if utilization < 70 or tasks > strategies.MAX_SEARCH_TASKS:
                continue
            more = {**processes, pid: dataclasses.replace(processes[pid], instances=processes[pid].instances + 1)}
            faster = engine.simulate(sim_orders, more, transfer, 0.0, random.Random(0), record=False, priority=chosen).makespan
            if faster < expected - 1e-6:
                advice.append(schemas.CapacityAdvice(
                    process_id=pid, process_name=processes[pid].name, instances=processes[pid].instances, utilization_pct=utilization,
                    makespan_minutes=faster, saving_pct=(1 - faster / expected) * 100,
                ))

        if outcome is not None:
            optimization = schemas.OptimizationInfo(
                start_rule=outcome.start_rule, start_label=strategies.LABELS[outcome.start_rule], start_makespan=outcome.start_makespan,
                best_makespan=outcome.best_makespan,
                improvement_pct=(1 - outcome.best_makespan / outcome.start_makespan) * 100 if outcome.start_makespan > 0 else 0.0,
                iterations=outcome.iterations, seconds=outcome.seconds, history=outcome.history,
            )
        if body.compare and outcome is not None:
            cmp_reps = min(15, max(0, MC_BUDGET // max(tasks * (len(strategies.RULES) + 1), 1)))
            for name in [*strategies.RULES, "optimized"]:
                det = outcome.rule_results[name] if name != "optimized" else engine.simulate(sim_orders, processes, transfer, 0.0, random.Random(0), record=False, priority=priority_of(name))
                p50 = p90 = None
                if cmp_reps >= 2 and sigma > 0:
                    p50, p90, _ = typical(priority_of(name), cmp_reps)
                comparison.append(schemas.StrategyRow(
                    strategy=name, label=strategies.LABELS[name], selected=name == strategy,
                    metrics=schemas.RunMetrics(**engine.metrics(det, sim_orders, processes, bound)), typical_p50=p50, typical_p90=p90,
                ))

    order_results: list[schemas.OrderResult] = []
    for i, (item, spec) in enumerate(zip(body.orders, specs)):
        product = products[item.product_id]
        base = dict(index=i, product_id=product.id, reference=product.reference, name=product.name, unit=product.unit, quantity=item.quantity)
        if blocked[i]:
            order_results.append(schemas.OrderResult(
                **base, simulated=False,
                blockers=[schemas.Blocker(process_id=pid, process_name=processes[pid].name if pid in processes else "Unknown", reason=reason, steps=names) for pid, reason, names in blocked[i]],
            ))
            continue
        k = runnable.index(i)
        ordered = engine.topo_order(spec.steps)
        order_results.append(schemas.OrderResult(
            **base, simulated=True, finish_minutes=result.finish[k], first_unit_minutes=result.first_done[k],
            unit_lead_time_minutes=engine.critical_path(spec.steps, processes, body.transfer_minutes),
            steps=[
                {"name": s.name, "process_id": s.process_id, "after": [i for i, other in enumerate(ordered) if other.id in s.deps]}
                for s in ordered
            ],
        ))

    used = {s.process_id for o in specs for s in o.steps}
    span = result.makespan if result else 0.0
    process_results = []
    for pid in sorted(used, key=lambda p: processes[p].name if p in processes else ""):
        process = processes.get(pid)
        if process is None:
            continue
        st = result.stats.get(pid) if result else None
        slots = process.slots
        process_results.append(schemas.ProcessResult(
            id=pid, name=process.name, code=process.code, enabled=process.enabled, capacity=process.capacity, instances=process.instances,
            slots=slots, tasks=st.tasks if st else 0, busy_minutes=st.busy if st else 0.0,
            utilization_pct=(st.busy / (slots * span) * 100) if st and slots and span > 0 else None,
            avg_wait_minutes=(st.wait / st.tasks) if st and st.tasks else 0.0,
        ))
    bottleneck = max((p for p in process_results if p.utilization_pct is not None), key=lambda p: p.utilization_pct, default=None)

    # trace order index refers to the simulated orders; map back to the request index
    trace = result.trace if result else []
    for row in trace:
        row[0] = runnable[int(row[0])]
    completions = [[] for _ in specs]
    if result:
        for k, i in enumerate(runnable):
            completions[i] = [round(t, 2) for t in result.completions[k]]

    return schemas.SimulationResponse(
        feasible=not any(blocked), seed=seed, transfer_minutes=body.transfer_minutes, variability_pct=body.variability_pct, capacity_mode=body.capacity_mode,
        makespan_minutes=result.makespan if result else None, orders=order_results, processes=process_results,
        bottleneck_process_id=bottleneck.id if bottleneck else None, monte_carlo=monte, warnings=warnings,
        completions=completions, trace=trace, strategy=strategy, strategy_label=strategies.LABELS[strategy] if sim_orders else "",
        metrics=metrics, comparison=comparison, optimization=optimization, advice=advice,
    )
