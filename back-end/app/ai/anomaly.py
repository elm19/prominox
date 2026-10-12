"""Anomaly detection with a robust z-score against a rolling median (no training data or labels needed)."""
from dataclasses import dataclass

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

THRESHOLDS = {"low": 6.0, "medium": 4.5, "high": 3.5}
MAX_POINTS = 20000
MIN_POINTS = 20


@dataclass
class AnomalyResult:
    ts: np.ndarray
    values: np.ndarray
    expected: np.ndarray
    scores: np.ndarray
    flagged: np.ndarray  # bool
    threshold: float


def detect(ts: np.ndarray, values: np.ndarray, sensitivity: str) -> AnomalyResult:
    ts, values = ts[-MAX_POINTS:], values[-MAX_POINTS:]
    n = len(values)
    k = min(61, max(5, (n // 20) | 1))
    pad = k // 2
    expected = np.median(sliding_window_view(np.pad(values, (pad, pad), mode="edge"), k), axis=1)
    residual = values - expected
    scale = 1.4826 * float(np.median(np.abs(residual - np.median(residual))))
    if scale < 1e-12:
        scale = float(np.std(residual))
    threshold = THRESHOLDS[sensitivity]
    if scale < 1e-12:
        scores = np.zeros(n)
    else:
        scores = np.abs(residual) / scale
    return AnomalyResult(ts, values, expected, scores, scores > threshold, threshold)


def group_events(result: AnomalyResult, gap: int = 2) -> list[dict]:
    """Merge neighbouring flagged readings into one event."""
    events: list[dict] = []
    for i in np.flatnonzero(result.flagged):
        if events and i - events[-1]["last"] <= gap:
            ev = events[-1]
            ev["last"] = int(i)
            ev["count"] += 1
            if result.scores[i] > ev["peak_score"]:
                ev["peak_score"], ev["peak_index"] = float(result.scores[i]), int(i)
        else:
            events.append({"first": int(i), "last": int(i), "count": 1, "peak_score": float(result.scores[i]), "peak_index": int(i)})
    return events


def chart_indices(result: AnomalyResult, limit: int = 500) -> np.ndarray:
    n = len(result.values)
    keep = np.zeros(n, dtype=bool)
    keep[:: max(1, n // limit)] = True
    keep |= result.flagged
    keep[-1] = True
    return np.flatnonzero(keep)
