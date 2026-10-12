"""Failure-risk model: Weibull fit on the time between corrective interventions."""
import math
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np

HORIZON_DAYS = 14
MIN_INTERVALS = 2


@dataclass
class RiskResult:
    intervals_days: list[float]
    mean_days: float
    shape: float
    scale: float
    last_event: datetime
    days_since: float
    probability: float  # chance of a corrective intervention within HORIZON_DAYS
    remaining_days: float  # median remaining time to the next one
    next_date: datetime
    confidence: float
    status: str
    overdue: bool


def _survival(t: float, shape: float, scale: float) -> float:
    return math.exp(-((t / scale) ** shape))


def assess(event_times: list[datetime], now: datetime) -> RiskResult | None:
    events = sorted(event_times)
    if len(events) < MIN_INTERVALS + 1:
        return None
    gaps = np.array([(b - a).total_seconds() / 86400 for a, b in zip(events, events[1:])])
    gaps = np.clip(gaps, 0.01, None)
    mean = float(gaps.mean())
    cv = float(gaps.std() / mean) if mean > 0 else 1.0
    cv = min(max(cv, 0.2), 2.0)  # keeps the fit stable with very few intervals
    shape = cv ** -1.086  # method-of-moments approximation
    scale = mean / math.gamma(1 + 1 / shape)

    since = max((now - events[-1]).total_seconds() / 86400, 0.0)
    s_now = max(_survival(since, shape, scale), 1e-12)
    probability = 1 - _survival(since + HORIZON_DAYS, shape, scale) / s_now
    remaining = scale * ((since / scale) ** shape + math.log(2)) ** (1 / shape) - since
    status = "service_soon" if probability >= 0.5 else "observe" if probability >= 0.25 else "healthy"
    n = len(gaps)
    return RiskResult(
        intervals_days=[round(float(g), 2) for g in gaps],
        mean_days=mean,
        shape=shape,
        scale=scale,
        last_event=events[-1],
        days_since=since,
        probability=float(probability),
        remaining_days=float(remaining),
        next_date=now + timedelta(days=float(remaining)),
        confidence=n / (n + 3),
        status=status,
        overdue=since > mean,
    )
