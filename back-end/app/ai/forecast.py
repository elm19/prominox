"""Sensor forecasting: several small models compete on a hold-out, the most accurate one is used."""
from dataclasses import dataclass

import numpy as np

NICE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400]
MAX_BUCKETS = 400
MAX_STEPS = 300
MIN_POINTS = 30


class NotEnoughData(Exception):
    pass


def _nice_step(seconds: float) -> float:
    return next((s for s in NICE_STEPS if s >= seconds), NICE_STEPS[-1])


def resample(ts: np.ndarray, values: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    """Average the readings into a regular time grid; gaps are filled by interpolation."""
    span = ts[-1] - ts[0]
    typical = float(np.median(np.diff(ts))) if len(ts) > 1 else 1.0
    step = _nice_step(max(typical, span / MAX_BUCKETS, 1.0))
    start = np.floor(ts[0] / step) * step
    idx = ((ts - start) // step).astype(int)
    size = int(idx[-1]) + 1
    sums = np.bincount(idx, weights=values, minlength=size)
    counts = np.bincount(idx, minlength=size)
    grid = start + step * np.arange(size)
    seen = counts > 0
    return grid, np.interp(grid, grid[seen], sums[seen] / counts[seen]), step


# --- candidate models: each takes the training series and returns `h` future values ---
def _naive(y: np.ndarray, h: int) -> tuple[np.ndarray, float]:
    return np.full(h, y[-1]), float(np.std(np.diff(y))) if len(y) > 2 else 0.0


def _trend(y: np.ndarray, h: int) -> tuple[np.ndarray, float]:
    m = min(len(y), max(10, len(y) // 3))
    x = np.arange(m)
    slope, intercept = np.polyfit(x, y[-m:], 1)
    fitted = slope * x + intercept
    sigma = float(np.std(y[-m:] - fitted))
    return slope * (m + np.arange(h)) + intercept, sigma


def _autoregressive(p: int):
    def model(y: np.ndarray, h: int) -> tuple[np.ndarray, float]:
        if len(y) < 3 * p + 5:
            raise NotEnoughData
        mu, sd = float(y.mean()), float(y.std()) or 1.0
        z = (y - mu) / sd
        rows = len(z) - p
        lags = np.column_stack([z[p - k - 1 : len(z) - k - 1] for k in range(p)] + [np.ones(rows)])
        target = z[p:]
        ridge = 1e-3 * rows * np.eye(p + 1)
        ridge[-1, -1] = 0.0
        coef = np.linalg.solve(lags.T @ lags + ridge, lags.T @ target)
        sigma = float(np.std(target - lags @ coef)) * sd
        history = list(z[-p:][::-1])  # most recent first
        out = []
        for _ in range(h):
            nxt = float(np.dot(coef[:p], history[:p]) + coef[p])
            out.append(nxt)
            history.insert(0, nxt)
        return np.array(out) * sd + mu, sigma

    return model


MODELS = {
    "Repeat last value": _naive,
    "Linear trend": _trend,
    "Autoregressive (2 lags)": _autoregressive(2),
    "Autoregressive (6 lags)": _autoregressive(6),
}


def _clamp(pred: np.ndarray, y: np.ndarray) -> np.ndarray:
    lo, hi = float(y.min()), float(y.max())
    pad = (hi - lo) * 0.5
    return np.clip(np.nan_to_num(pred, nan=y[-1]), lo - pad, hi + pad)


def _holdout_mae(model, y: np.ndarray, h: int) -> float:
    """Mean absolute error when forecasting `h` steps ahead from up to three earlier origins."""
    errors = []
    for shift in (0, h // 2, h):
        cut = len(y) - h - shift
        if cut < 20:
            continue
        try:
            pred, _ = model(y[:cut], h)
        except NotEnoughData:
            return float("inf")
        errors.append(float(np.mean(np.abs(_clamp(pred, y[:cut]) - y[cut : cut + h]))))
    if not errors:
        raise NotEnoughData
    return float(np.mean(errors))


@dataclass
class ForecastResult:
    grid: np.ndarray
    y: np.ndarray
    step: float
    future_t: np.ndarray
    mean: np.ndarray
    lower: np.ndarray
    upper: np.ndarray
    best: str
    candidates: list[tuple[str, float]]
    baseline_mae: float
    best_mae: float


def forecast(ts: np.ndarray, values: np.ndarray, horizon_seconds: float) -> ForecastResult:
    if len(ts) < MIN_POINTS:
        raise NotEnoughData(f"Need at least {MIN_POINTS} readings, found {len(ts)}.")
    grid, y, step = resample(ts, values)
    if len(y) < MIN_POINTS:
        raise NotEnoughData("The selected window is too short once readings are averaged; choose a longer window.")
    steps = int(min(MAX_STEPS, max(1, round(horizon_seconds / step))))
    h_eval = max(1, min(steps, len(y) // 4))

    scores = []
    for name, model in MODELS.items():
        try:
            scores.append((name, _holdout_mae(model, y, h_eval)))
        except NotEnoughData:
            continue
    if not scores:
        raise NotEnoughData("Not enough history to validate a model.")
    scores.sort(key=lambda item: item[1])
    best_name, best_mae = scores[0]
    baseline = next(mae for name, mae in scores if name == "Repeat last value")

    pred, sigma = MODELS[best_name](y, steps)
    pred = _clamp(pred, y)
    sigma = max(sigma, float(np.std(np.diff(y))) * 0.5, 1e-9)
    width = 1.28 * sigma * np.sqrt(np.arange(1, steps + 1))
    width = np.minimum(width, max(float(y.max() - y.min()), 1e-9))
    future_t = grid[-1] + step * np.arange(1, steps + 1)
    return ForecastResult(grid, y, step, future_t, pred, pred - width, pred + width, best_name, scores, baseline, best_mae)
