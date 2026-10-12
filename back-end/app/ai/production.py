"""Production-run estimates: lead time versus batch size by least squares, with a prediction interval."""
from dataclasses import dataclass

import numpy as np

MIN_RUNS = 5
# two-sided 80% Student-t quantiles by degrees of freedom
_T80 = {1: 3.078, 2: 1.886, 3: 1.638, 4: 1.533, 5: 1.476, 6: 1.440, 7: 1.415, 8: 1.397, 9: 1.383, 10: 1.372, 15: 1.341, 20: 1.325, 30: 1.310}


def _t80(df: int) -> float:
    return _T80[max(k for k in _T80 if k <= max(df, 1))] if df < 30 else 1.282


@dataclass
class LineFit:
    intercept: float
    slope: float
    r2: float
    sigma: float
    n: int
    mean_x: float
    sxx: float

    def predict(self, x: float) -> tuple[float, float]:
        """Value and half-width of the 80% interval."""
        se = self.sigma * np.sqrt(1 + 1 / self.n + (x - self.mean_x) ** 2 / self.sxx) if self.sxx > 0 else self.sigma
        return self.intercept + self.slope * x, float(_t80(self.n - 2) * se)


def fit_line(x: np.ndarray, y: np.ndarray) -> LineFit:
    n = len(x)
    mean_x = float(x.mean())
    sxx = float(((x - mean_x) ** 2).sum())
    if sxx <= 0:  # every run had the same size: fall back to the average
        return LineFit(float(y.mean()), 0.0, 0.0, float(y.std(ddof=1)) if n > 1 else 0.0, n, mean_x, 0.0)
    slope = float(((x - mean_x) * (y - y.mean())).sum() / sxx)
    intercept = float(y.mean() - slope * mean_x)
    resid = y - (intercept + slope * x)
    sst = float(((y - y.mean()) ** 2).sum())
    r2 = 1 - float((resid**2).sum()) / sst if sst > 0 else 0.0
    sigma = float(np.sqrt((resid**2).sum() / max(n - 2, 1)))
    return LineFit(intercept, slope, max(r2, 0.0), sigma, n, mean_x, sxx)
