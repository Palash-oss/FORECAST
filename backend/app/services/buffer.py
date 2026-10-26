"""
Empirical Reserve Buffer Service.
Computes the empirical reserve margin (in MW) required at a specified confidence level
from historical shortfall distribution (positive forecast errors, where wind underperformed).
"""

import numpy as np
import pandas as pd


def compute_empirical_buffer(
    historical_errors: pd.Series, confidence_level: float = 0.90
) -> tuple[float, str]:
    """
    Compute empirical buffer (MW) from historical shortfalls (positive errors).

    Formula:
    Shortfalls S = { e in errors | e > 0 }
    Buffer = Quantile(S, confidence_level)
    """
    valid_errors = historical_errors.dropna().to_numpy(dtype=float)
    shortfalls = valid_errors[valid_errors > 0]

    if len(shortfalls) == 0:
        buffer_mw = 0.0
        explanation = (
            "No historical wind shortfall occurrences (error > 0) detected. Buffer set to 0.0 MW."
        )
        return buffer_mw, explanation

    pct = confidence_level * 100.0
    buffer_mw = float(np.percentile(shortfalls, pct))
    buffer_mw = round(buffer_mw, 1)

    explanation = (
        f"Empirical P{pct:.0f} reserve buffer of {buffer_mw:.0f} MW derived from "
        f"{len(shortfalls)} historical half-hour wind shortfall events (where wind underperformed forecast). "
        f"Holding this reserve protects against {pct:.0f}% of observed generation shortfalls."
    )
    return buffer_mw, explanation


def compute_buffer_bands(forecast_series: pd.Series, buffer_mw: float) -> pd.DataFrame:
    """
    Returns DataFrame with columns [forecast_mw, conservative_wind_mw, buffer_mw].
    conservative_wind_mw = max(0, forecast_mw - buffer_mw).
    """
    df = pd.DataFrame({"forecast_mw": forecast_series})
    df["buffer_mw"] = buffer_mw
    df["conservative_wind_mw"] = np.maximum(0.0, df["forecast_mw"] - buffer_mw)
    return df
