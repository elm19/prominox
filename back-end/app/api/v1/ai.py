"""AI Lab: small, explainable models fitted on demand to the data already collected."""
from datetime import datetime, timedelta, timezone

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ai import anomaly as anomaly_model
from app.ai import forecast as forecast_model
from app.ai import maintenance as maintenance_model
from app.ai import production as production_model
from app.database import get_db
from app.models.process import ProcessDB
from app.models.process_data import MaintenanceLogDB, PredictionSnapshotDB, ProcessSensorDB, SensorReadingDB
from app.models.product import ProductDB
from app.models.production import ProductionRunDB
from app.schemas import ai as schemas

router = APIRouter(prefix="/ai", tags=["AI Lab"])

CORRECTIVE = "corrective"
MAX_READINGS = 50000


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _dt(epoch: float) -> datetime:
    return datetime.fromtimestamp(float(epoch), tz=timezone.utc)


def _process_and_sensor(db: Session, process_id: int, sensor_id: int) -> tuple[ProcessDB, ProcessSensorDB]:
    process = db.get(ProcessDB, process_id)
    sensor = db.get(ProcessSensorDB, sensor_id)
    if not process or not sensor or sensor.process_id != process_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Process or sensor not found")
    return process, sensor


def _series(db: Session, sensor: ProcessSensorDB, hours: float, column) -> tuple[np.ndarray, list]:
    """Readings of the `hours` before the sensor's newest reading (the data may be historical, not live)."""
    latest = db.query(func.max(SensorReadingDB.recorded_at)).filter(SensorReadingDB.sensor_id == sensor.id).scalar()
    if latest is None:
        return np.array([]), []
    rows = (
        db.query(SensorReadingDB.recorded_at, column)
        .filter(SensorReadingDB.sensor_id == sensor.id, SensorReadingDB.recorded_at >= latest - timedelta(hours=hours), column.isnot(None))
        .order_by(SensorReadingDB.recorded_at.desc())
        .limit(MAX_READINGS)
        .all()
    )
    rows.reverse()
    return np.array([r[0].timestamp() for r in rows]), [r[1] for r in rows]


@router.get("/catalog", response_model=schemas.AiCatalog)
def catalog(db: Session = Depends(get_db)):
    stats = {
        sensor_id: (count, first, last)
        for sensor_id, count, first, last in db.query(
            SensorReadingDB.sensor_id, func.count(), func.min(SensorReadingDB.recorded_at), func.max(SensorReadingDB.recorded_at)
        ).group_by(SensorReadingDB.sensor_id)
    }
    corrective = dict(
        db.query(MaintenanceLogDB.process_id, func.count()).filter(MaintenanceLogDB.type == CORRECTIVE).group_by(MaintenanceLogDB.process_id).all()
    )
    processes = [
        schemas.CatalogProcess(
            id=p.id, name=p.name, code=p.code, status=p.status, corrective_count=corrective.get(p.id, 0),
            sensors=[
                schemas.CatalogSensor(
                    id=s.id, name=s.name, data_type=s.data_type,
                    reading_count=stats.get(s.id, (0, None, None))[0],
                    first_at=stats.get(s.id, (0, None, None))[1], last_at=stats.get(s.id, (0, None, None))[2],
                )
                for s in p.sensors
            ],
        )
        for p in db.query(ProcessDB).order_by(ProcessDB.name).all()
    ]
    run_counts = dict(db.query(ProductionRunDB.product_id, func.count()).group_by(ProductionRunDB.product_id).all())
    products = [
        schemas.CatalogProduct(id=p.id, reference=p.reference, name=p.name, unit=p.unit, run_count=run_counts.get(p.id, 0))
        for p in db.query(ProductDB).order_by(ProductDB.name).all()
    ]
    return schemas.AiCatalog(processes=processes, products=products)


@router.post("/forecast", response_model=schemas.ForecastResponse)
def run_forecast(body: schemas.ForecastRequest, db: Session = Depends(get_db)):
    _, sensor = _process_and_sensor(db, body.process_id, body.sensor_id)
    if sensor.data_type != "number":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Forecasts are only available for number sensors")
    ts, values = _series(db, sensor, body.history_hours, SensorReadingDB.value_number)
    try:
        result = forecast_model.forecast(ts, np.array(values, dtype=float), body.horizon_minutes * 60)
    except forecast_model.NotEnoughData as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error) or "Not enough data")
    improvement = (1 - result.best_mae / result.baseline_mae) * 100 if result.baseline_mae > 1e-12 else 0.0
    quality = "good" if improvement >= 15 else "fair" if improvement >= 0 else "poor"
    tail = slice(-300, None)
    return schemas.ForecastResponse(
        sensor_name=sensor.name,
        model=result.best,
        quality=quality,
        mae=result.best_mae,
        baseline_mae=result.baseline_mae,
        improvement_pct=improvement,
        step_seconds=result.step,
        horizon_steps=len(result.mean),
        readings_used=len(ts),
        history=[schemas.TimePoint(t=_dt(t), value=float(v)) for t, v in zip(result.grid[tail], result.y[tail])],
        forecast=[
            schemas.ForecastPoint(t=_dt(t), value=float(m), lower=float(lo), upper=float(hi))
            for t, m, lo, hi in zip(result.future_t, result.mean, result.lower, result.upper)
        ],
        candidates=[schemas.CandidateScore(name=n, mae=None if not np.isfinite(m) else float(m)) for n, m in result.candidates],
    )


@router.post("/anomalies", response_model=schemas.AnomalyResponse)
def run_anomalies(body: schemas.AnomalyRequest, db: Session = Depends(get_db)):
    process = db.get(ProcessDB, body.process_id)
    if not process:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Process not found")
    sensors: list[schemas.SensorAnomalies] = []
    starts, ends = [], []
    for sensor in process.sensors:
        if sensor.data_type == "number":
            ts, values = _series(db, sensor, body.window_hours, SensorReadingDB.value_number)
            if len(ts) < anomaly_model.MIN_POINTS:
                sensors.append(schemas.SensorAnomalies(
                    sensor_id=sensor.id, name=sensor.name, data_type=sensor.data_type, readings=len(ts), anomaly_count=0,
                    skipped_reason=f"Needs at least {anomaly_model.MIN_POINTS} readings in the window",
                ))
                continue
            result = anomaly_model.detect(ts, np.array(values, dtype=float), body.sensitivity.value)
            starts.append(result.ts[0])
            ends.append(result.ts[-1])
            events = anomaly_model.group_events(result)
            sensors.append(schemas.SensorAnomalies(
                sensor_id=sensor.id, name=sensor.name, data_type=sensor.data_type, readings=len(ts),
                anomaly_count=int(result.flagged.sum()),
                events=[
                    schemas.AnomalyEvent(
                        start=_dt(result.ts[e["first"]]), end=_dt(result.ts[e["last"]]), count=e["count"],
                        peak_value=float(result.values[e["peak_index"]]), expected=float(result.expected[e["peak_index"]]), score=e["peak_score"],
                    )
                    for e in reversed(events[-50:])
                ],
                series=[
                    schemas.AnomalyPoint(t=_dt(result.ts[i]), value=float(result.values[i]), expected=float(result.expected[i]),
                                         score=float(result.scores[i]), flagged=bool(result.flagged[i]))
                    for i in anomaly_model.chart_indices(result)
                ],
            ))
        else:
            column = SensorReadingDB.value_bool if sensor.data_type == "boolean" else SensorReadingDB.value_text
            ts, values = _series(db, sensor, body.window_hours, column)
            values = [str(v) for v in values]
            if len(values) < 50:
                sensors.append(schemas.SensorAnomalies(
                    sensor_id=sensor.id, name=sensor.name, data_type=sensor.data_type, readings=len(values), anomaly_count=0,
                    skipped_reason="Needs at least 50 readings in the window",
                ))
                continue
            counts: dict[str, int] = {}
            last_seen: dict[str, float] = {}
            for t, v in zip(ts, values):
                counts[v] = counts.get(v, 0) + 1
                last_seen[v] = t
            rare = [
                schemas.RareValue(value=v, count=c, share_pct=c / len(values) * 100, last_seen=_dt(last_seen[v]))
                for v, c in sorted(counts.items(), key=lambda item: item[1]) if c / len(values) < 0.02
            ]
            sensors.append(schemas.SensorAnomalies(
                sensor_id=sensor.id, name=sensor.name, data_type=sensor.data_type, readings=len(values),
                anomaly_count=sum(r.count for r in rare), rare_values=rare[:20],
            ))
    return schemas.AnomalyResponse(
        window_start=_dt(min(starts)) if starts else None, window_end=_dt(max(ends)) if ends else None, sensors=sensors
    )


def _risk(process: ProcessDB, events: list[datetime], now: datetime) -> schemas.MaintenanceRisk:
    base = dict(process_id=process.id, process_name=process.name, process_code=process.code, corrective_events=len(events))
    result = maintenance_model.assess(events, now)
    if result is None:
        needed = maintenance_model.MIN_INTERVALS + 1
        return schemas.MaintenanceRisk(**base, ready=False, note=f"Needs {needed} corrective maintenance logs, has {len(events)}")
    return schemas.MaintenanceRisk(
        **base, ready=True, status=result.status, probability_14d=result.probability, mean_interval_days=result.mean_days,
        days_since_last=result.days_since, last_corrective_at=result.last_event, next_expected_at=result.next_date,
        remaining_days=result.remaining_days, overdue=result.overdue, confidence=result.confidence, intervals_days=result.intervals_days,
    )


def _corrective_events(db: Session) -> dict[int, list[datetime]]:
    out: dict[int, list[datetime]] = {}
    for process_id, performed_at in db.query(MaintenanceLogDB.process_id, MaintenanceLogDB.performed_at).filter(MaintenanceLogDB.type == CORRECTIVE):
        out.setdefault(process_id, []).append(_utc(performed_at))
    return out


@router.get("/maintenance-risk", response_model=list[schemas.MaintenanceRisk])
def maintenance_risk(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    events = _corrective_events(db)
    rows = [_risk(p, events.get(p.id, []), now) for p in db.query(ProcessDB).filter(ProcessDB.status == "active").order_by(ProcessDB.name)]
    rows.sort(key=lambda r: (not r.ready, -(r.probability_14d or 0)))
    return rows


@router.post("/maintenance-risk/{process_id}/snapshot", response_model=schemas.MaintenanceRisk)
def save_snapshot(process_id: int, db: Session = Depends(get_db)):
    """Publishes the current estimate on the process page (replaces the previous one)."""
    process = db.get(ProcessDB, process_id)
    if not process:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Process not found")
    now = datetime.now(timezone.utc)
    risk = _risk(process, _corrective_events(db).get(process_id, []), now)
    if not risk.ready:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, risk.note or "Not enough data")
    db.query(PredictionSnapshotDB).filter(PredictionSnapshotDB.process_id == process_id).update({"is_latest": False})
    db.add(PredictionSnapshotDB(
        process_id=process_id,
        result=f"{risk.probability_14d * 100:.0f}% chance of a corrective intervention within {maintenance_model.HORIZON_DAYS} days",
        remaining_useful_life_hours=risk.remaining_days * 24,
        next_maintenance_date=risk.next_expected_at,
        confidence=risk.confidence,
        last_prediction_date=now,
        status=risk.status,
        is_latest=True,
    ))
    db.commit()
    return risk


@router.post("/production-estimate", response_model=schemas.ProductionEstimateResponse)
def production_estimate(body: schemas.ProductionEstimateRequest, db: Session = Depends(get_db)):
    product = db.get(ProductDB, body.product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    runs = db.query(ProductionRunDB).filter(ProductionRunDB.product_id == product.id).order_by(ProductionRunDB.started_at).all()
    points = [
        schemas.RunPoint(
            batch=r.batch_number, quantity=r.quantity_produced, lead_time_hours=r.lead_time_hours,
            scrap_pct=r.quantity_scrap / (r.quantity_produced + r.quantity_scrap) * 100 if (r.quantity_produced + r.quantity_scrap) > 0 else 0.0,
        )
        for r in runs
    ]
    base = dict(product_name=product.name, unit=product.unit, runs_used=len(points), quantity=body.quantity, runs=points)
    if len(points) < production_model.MIN_RUNS:
        return schemas.ProductionEstimateResponse(**base, ready=False, note=f"Needs {production_model.MIN_RUNS} production runs, has {len(points)}")
    x = np.array([p.quantity for p in points])
    lead = production_model.fit_line(x, np.array([p.lead_time_hours for p in points]))
    value, half = lead.predict(body.quantity)
    scrap = np.array([p.scrap_pct for p in points])
    scrap_mean = float(scrap.mean())
    scrap_half = float(1.282 * scrap.std(ddof=1)) if len(scrap) > 1 else 0.0
    lo_x, hi_x = float(x.min()), float(max(x.max(), body.quantity))
    return schemas.ProductionEstimateResponse(
        **base, ready=True,
        note=None if lead.sxx > 0 else "All past runs had the same size, so the estimate is the average lead time",
        lead_time=schemas.Estimate(value=max(value, 0.0), low=max(value - half, 0.0), high=max(value + half, 0.0)),
        scrap_pct=schemas.Estimate(value=scrap_mean, low=max(scrap_mean - scrap_half, 0.0), high=min(scrap_mean + scrap_half, 100.0)),
        r2=lead.r2, hours_per_unit=lead.slope if lead.sxx > 0 else None, setup_hours=lead.intercept if lead.sxx > 0 else None,
        line=[{"quantity": q, "lead_time_hours": max(lead.intercept + lead.slope * q, 0.0)} for q in (lo_x, hi_x)],
    )


@router.post("/sensor-summary", response_model=schemas.SensorSummaryResponse)
def sensor_summary(body: schemas.SensorSummaryRequest, db: Session = Depends(get_db)):
    """Per-sensor statistics over the window ending at each sensor's newest reading."""
    process = db.get(ProcessDB, body.process_id)
    if not process:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Process not found")
    out: list[schemas.SensorSummary] = []
    for sensor in process.sensors:
        column = {"number": SensorReadingDB.value_number, "boolean": SensorReadingDB.value_bool}.get(sensor.data_type, SensorReadingDB.value_text)
        ts, values = _series(db, sensor, body.hours, column)
        item = schemas.SensorSummary(sensor_id=sensor.id, name=sensor.name, data_type=sensor.data_type, readings=len(values))
        if len(values):
            item.latest = str(values[-1])
            item.latest_at = _dt(ts[-1])
            if sensor.data_type == "number":
                arr = np.array(values, dtype=float)
                item.min, item.max, item.mean, item.std = float(arr.min()), float(arr.max()), float(arr.mean()), float(arr.std())
                if len(arr) > 2 and ts[-1] > ts[0]:
                    item.trend_per_hour = float(np.polyfit((ts - ts[0]) / 3600, arr, 1)[0])
            elif sensor.data_type == "boolean":
                item.true_share_pct = float(np.mean([bool(v) for v in values]) * 100)
            else:
                counts: dict[str, int] = {}
                for v in values:
                    counts[str(v)] = counts.get(str(v), 0) + 1
                item.top_values = [{"value": k, "count": c} for k, c in sorted(counts.items(), key=lambda kv: -kv[1])[:5]]
        out.append(item)
    return schemas.SensorSummaryResponse(process_name=process.name, hours=body.hours, sensors=out)
