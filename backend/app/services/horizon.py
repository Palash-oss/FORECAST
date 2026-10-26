"""
Forecast Horizon Service.
Computes error versus lead time (target startTime - publishTime) for all pairs
over a configurable 0-48h horizon range.
"""

from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd

_CACHED_MERGED_HORIZON_DF: pd.DataFrame | None = None
_CACHED_HORIZON_RESULTS: dict[tuple[float, float], dict[str, Any]] = {}


def get_merged_horizon_df(forecasts_df: pd.DataFrame, actuals_df: pd.DataFrame) -> pd.DataFrame:
    """Pre-merges forecasts and actuals once to optimize subsequent slicing."""
    global _CACHED_MERGED_HORIZON_DF
    if _CACHED_MERGED_HORIZON_DF is not None:
        return _CACHED_MERGED_HORIZON_DF

    hourly_actuals = actuals_df[actuals_df["startTime"].dt.minute == 0][
        ["startTime", "generation"]
    ].rename(columns={"generation": "actual_mw"})

    merged = pd.merge(forecasts_df, hourly_actuals, on="startTime", how="inner")
    if merged.empty:
        _CACHED_MERGED_HORIZON_DF = pd.DataFrame()
        return _CACHED_MERGED_HORIZON_DF

    merged["lead_time_hours"] = (
        merged["startTime"] - merged["publishTime"]
    ).dt.total_seconds() / 3600.0
    merged["error_mw"] = merged["generation"] - merged["actual_mw"]
    merged["abs_error_mw"] = np.abs(merged["error_mw"])
    merged["lead_hour_int"] = merged["lead_time_hours"].round()

    _CACHED_MERGED_HORIZON_DF = merged
    return _CACHED_MERGED_HORIZON_DF


def compute_horizon_analysis(
    forecasts_df: pd.DataFrame,
    actuals_df: pd.DataFrame,
    min_horizon_hours: float = 0.0,
    max_horizon_hours: float = 48.0,
) -> dict[str, Any]:
    """
    Evaluates forecast accuracy across lead times for all (publishTime, startTime) vintages.
    Returns aggregated buckets and continuous hourly curve (never raw pairs).
    """
    cache_key = (float(min_horizon_hours), float(max_horizon_hours))
    if cache_key in _CACHED_HORIZON_RESULTS:
        return _CACHED_HORIZON_RESULTS[cache_key]

    merged = get_merged_horizon_df(forecasts_df, actuals_df)
    if merged.empty:
        return {
            "min_horizon_hours": min_horizon_hours,
            "max_horizon_hours": max_horizon_hours,
            "buckets": [],
            "continuous": [],
            "summary_insight": "No matching forecast-actual pairs found.",
        }

    # Filter within requested horizon range
    in_range = merged[
        (merged["lead_time_hours"] >= min_horizon_hours)
        & (merged["lead_time_hours"] <= max_horizon_hours)
    ]

    # 1. Define standard trading horizon buckets
    bucket_defs = [
        ("0-6h (Intraday)", 0.0, 6.0),
        ("6-12h (Short DA)", 6.0, 12.0),
        ("12-24h (DA Peak)", 12.0, 24.0),
        ("24-36h (DA Off-Peak)", 24.0, 36.0),
        ("36-48h (D-2 Frontier)", 36.0, 48.0),
    ]

    bucket_rows: list[dict[str, Any]] = []
    for b_label, b_min, b_max in bucket_defs:
        b_data = in_range[
            (in_range["lead_time_hours"] >= b_min) & (in_range["lead_time_hours"] < b_max)
        ]
        if not b_data.empty:
            mae = float(b_data["abs_error_mw"].mean())
            rmse = float(np.sqrt((b_data["error_mw"] ** 2).mean()))
            bias = float(b_data["error_mw"].mean())
            count = len(b_data)
        else:
            mae, rmse, bias, count = 0.0, 0.0, 0.0, 0

        bucket_rows.append(
            {
                "bucket": b_label,
                "min_hours": b_min,
                "max_hours": b_max,
                "mae": round(mae, 1),
                "rmse": round(rmse, 1),
                "mean_bias": round(bias, 1),
                "sample_count": count,
            }
        )

    # 2. Continuous lead time aggregation by integer hour
    continuous_rows: list[dict[str, Any]] = []

    for h, group in in_range.groupby("lead_hour_int"):
        h_val = float(h)
        if group.empty or h_val < min_horizon_hours or h_val > max_horizon_hours:
            continue
        mae = float(group["abs_error_mw"].mean())
        rmse = float(np.sqrt((group["error_mw"] ** 2).mean()))
        bias = float(group["error_mw"].mean())
        continuous_rows.append(
            {
                "lead_time_hours": h_val,
                "mae": round(mae, 1),
                "rmse": round(rmse, 1),
                "mean_bias": round(bias, 1),
                "sample_count": len(group),
            }
        )
    continuous_rows.sort(key=lambda x: x["lead_time_hours"])

    # Strict numerical summary insight (no speculative demand/weather claims)
    if (
        len(bucket_rows) >= 3
        and bucket_rows[0]["sample_count"] > 0
        and bucket_rows[2]["sample_count"] > 0
    ):
        short_mae = bucket_rows[0]["mae"]
        da_mae = bucket_rows[2]["mae"]
        growth = ((da_mae - short_mae) / short_mae * 100.0) if short_mae > 0 else 0
        summary_insight = (
            f"Forecast error scales with lead time: MAE increases from {short_mae:.0f} MW in the 0-6h horizon "
            f"to {da_mae:.0f} MW at standard day-ahead (12-24h), a {growth:+.1f}% increase in error dispersion."
        )
    else:
        summary_insight = f"Evaluated {len(in_range)} forecast-outturn vintages across {min_horizon_hours:.0f}-{max_horizon_hours:.0f}h horizon."

    result = {
        "min_horizon_hours": min_horizon_hours,
        "max_horizon_hours": max_horizon_hours,
        "buckets": bucket_rows,
        "continuous": continuous_rows,
        "summary_insight": summary_insight,
    }

    _CACHED_HORIZON_RESULTS[cache_key] = result
    return result
