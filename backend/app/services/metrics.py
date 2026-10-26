"""
Statistical metrics calculation service for wind forecast evaluation.
Formulas:
- Error: error_i = forecast_i - actual_i (positive = over-forecast = shortfall)
- MAE: (1/N) * sum(|error_i|)
- RMSE: sqrt((1/N) * sum(error_i^2))
- Mean Bias: (1/N) * sum(error_i)
- Median AE: median(|error_i|)
- P90/P95/P99 AE: 90th, 95th, 99th percentiles of |error_i|
- Shortfall Rate: percentage of evaluated periods where error_i > 0
- Shortfall P90/P95: 90th and 95th percentiles of positive errors (error_i > 0)
- Normalised MAE: MAE / mean(actuals) * 100 (%)
"""

from typing import Any

import numpy as np
import pandas as pd


def compute_metrics_series(
    errors: np.ndarray, actuals: np.ndarray, forecasts: np.ndarray
) -> dict[str, float]:
    """Compute full set of accuracy metrics from valid error and actual arrays."""
    n = len(errors)
    if n == 0:
        return {
            "mae": 0.0,
            "rmse": 0.0,
            "mean_bias": 0.0,
            "median_ae": 0.0,
            "p90_ae": 0.0,
            "p95_ae": 0.0,
            "p99_ae": 0.0,
            "shortfall_rate_pct": 0.0,
            "shortfall_p90_mw": 0.0,
            "shortfall_p95_mw": 0.0,
            "mean_actual_mw": 0.0,
            "mean_forecast_mw": 0.0,
            "normalised_mae_pct": 0.0,
            "sample_count": 0,
        }

    abs_errors = np.abs(errors)
    mae = float(np.mean(abs_errors))
    rmse = float(np.sqrt(np.mean(errors**2)))
    mean_bias = float(np.mean(errors))
    median_ae = float(np.median(abs_errors))
    p90_ae = float(np.percentile(abs_errors, 90))
    p95_ae = float(np.percentile(abs_errors, 95))
    p99_ae = float(np.percentile(abs_errors, 99))

    positive_errors = errors[errors > 0]
    shortfall_count = len(positive_errors)
    shortfall_rate = float((shortfall_count / n) * 100.0)

    if shortfall_count > 0:
        shortfall_p90 = float(np.percentile(positive_errors, 90))
        shortfall_p95 = float(np.percentile(positive_errors, 95))
    else:
        shortfall_p90 = 0.0
        shortfall_p95 = 0.0

    mean_actual = float(np.mean(actuals))
    mean_forecast = float(np.mean(forecasts))

    # Normalised MAE: divided by overall mean actual to avoid zero-division
    normalised_mae = (mae / mean_actual * 100.0) if mean_actual > 0 else 0.0

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mean_bias": round(mean_bias, 2),
        "median_ae": round(median_ae, 2),
        "p90_ae": round(p90_ae, 2),
        "p95_ae": round(p95_ae, 2),
        "p99_ae": round(p99_ae, 2),
        "shortfall_rate_pct": round(shortfall_rate, 2),
        "shortfall_p90_mw": round(shortfall_p90, 2),
        "shortfall_p95_mw": round(shortfall_p95, 2),
        "mean_actual_mw": round(mean_actual, 2),
        "mean_forecast_mw": round(mean_forecast, 2),
        "normalised_mae_pct": round(normalised_mae, 2),
        "sample_count": n,
    }


def compute_accuracy_summary(df_evaluated: pd.DataFrame, cutoff_time: str) -> dict[str, Any]:
    """Compute overall summary metrics across the evaluated dataset."""
    valid = df_evaluated.dropna(subset=["error_mw", "actual_mw", "forecast_mw"])
    errors = valid["error_mw"].to_numpy(dtype=float)
    actuals = valid["actual_mw"].to_numpy(dtype=float)
    forecasts = valid["forecast_mw"].to_numpy(dtype=float)

    metrics = compute_metrics_series(errors, actuals, forecasts)
    metrics["cutoff_time"] = cutoff_time
    metrics["total_evaluated_half_hours"] = len(valid)
    metrics["sample_window"] = (
        "Delivery dates: 2026-01-02 to 2026-02-01 (Decision dates: 2026-01-01 to 2026-01-31)"
    )
    return metrics


def compute_daily_metrics(df_evaluated: pd.DataFrame) -> list[dict[str, Any]]:
    """Compute accuracy metrics per delivery date."""
    daily_results = []
    for d, group in df_evaluated.groupby("delivery_date"):
        valid = group.dropna(subset=["error_mw", "actual_mw", "forecast_mw"])
        if valid.empty:
            continue
        errors = valid["error_mw"].to_numpy(dtype=float)
        actuals = valid["actual_mw"].to_numpy(dtype=float)
        forecasts = valid["forecast_mw"].to_numpy(dtype=float)
        m = compute_metrics_series(errors, actuals, forecasts)
        daily_results.append(
            {
                "delivery_date": str(d),
                "mae": m["mae"],
                "rmse": m["rmse"],
                "mean_bias": m["mean_bias"],
                "shortfall_rate_pct": m["shortfall_rate_pct"],
                "shortfall_p90_mw": m["shortfall_p90_mw"],
                "actual_mean_mw": m["mean_actual_mw"],
                "forecast_mean_mw": m["mean_forecast_mw"],
                "total_periods": len(valid),
                "has_full_coverage": len(valid) == 48,
            }
        )
    daily_results.sort(key=lambda x: x["delivery_date"])
    return daily_results


def compute_by_hour_metrics(df_evaluated: pd.DataFrame) -> list[dict[str, Any]]:
    """Compute accuracy metrics grouped by hour-of-day (0..23)."""
    valid = df_evaluated.dropna(subset=["error_mw", "actual_mw", "forecast_mw"]).copy()
    valid["hour"] = pd.to_datetime(valid["startTime"]).dt.hour

    hourly_results = []
    for hour, group in valid.groupby("hour"):
        errors = group["error_mw"].to_numpy(dtype=float)
        actuals = group["actual_mw"].to_numpy(dtype=float)
        forecasts = group["forecast_mw"].to_numpy(dtype=float)
        m = compute_metrics_series(errors, actuals, forecasts)
        hourly_results.append(
            {
                "hour": int(hour),
                "hour_label": f"{int(hour):02d}:00",
                "mae": m["mae"],
                "rmse": m["rmse"],
                "mean_bias": m["mean_bias"],
                "p90_ae": m["p90_ae"],
                "actual_mean_mw": m["mean_actual_mw"],
                "forecast_mean_mw": m["mean_forecast_mw"],
                "count": len(group),
            }
        )
    hourly_results.sort(key=lambda x: x["hour"])
    return hourly_results


def compute_distribution_metrics(df_evaluated: pd.DataFrame, num_bins: int = 30) -> dict[str, Any]:
    """Compute histogram distribution and quantiles of forecast errors and shortfalls."""
    valid = df_evaluated.dropna(subset=["error_mw"])
    errors = valid["error_mw"].to_numpy(dtype=float)
    if len(errors) == 0:
        return {
            "histogram": [],
            "quantiles": {},
            "shortfall_quantiles": {},
            "mean_bias": 0,
            "mae": 0,
            "std_dev": 0,
        }

    counts, bin_edges = np.histogram(errors, bins=num_bins)
    total_count = len(errors)

    histogram = []
    for i in range(len(counts)):
        b_start = float(bin_edges[i])
        b_end = float(bin_edges[i + 1])
        histogram.append(
            {
                "bin_start": round(b_start, 1),
                "bin_end": round(b_end, 1),
                "bin_center": round((b_start + b_end) / 2.0, 1),
                "count": int(counts[i]),
                "frequency_pct": round((counts[i] / total_count) * 100.0, 2),
                "is_shortfall": ((b_start + b_end) / 2.0) > 0,
            }
        )

    quantiles = {
        "p01": round(float(np.percentile(errors, 1)), 1),
        "p05": round(float(np.percentile(errors, 5)), 1),
        "p10": round(float(np.percentile(errors, 10)), 1),
        "p25": round(float(np.percentile(errors, 25)), 1),
        "p50": round(float(np.percentile(errors, 50)), 1),
        "p75": round(float(np.percentile(errors, 75)), 1),
        "p90": round(float(np.percentile(errors, 90)), 1),
        "p95": round(float(np.percentile(errors, 95)), 1),
        "p99": round(float(np.percentile(errors, 99)), 1),
    }

    positive_errors = errors[errors > 0]
    if len(positive_errors) > 0:
        shortfall_quantiles = {
            "p50": round(float(np.percentile(positive_errors, 50)), 1),
            "p75": round(float(np.percentile(positive_errors, 75)), 1),
            "p90": round(float(np.percentile(positive_errors, 90)), 1),
            "p95": round(float(np.percentile(positive_errors, 95)), 1),
            "p99": round(float(np.percentile(positive_errors, 99)), 1),
        }
    else:
        shortfall_quantiles = {"p50": 0.0, "p75": 0.0, "p90": 0.0, "p95": 0.0, "p99": 0.0}

    return {
        "total_samples": total_count,
        "quantiles": quantiles,
        "shortfall_quantiles": shortfall_quantiles,
        "histogram": histogram,
        "mean_bias": round(float(np.mean(errors)), 1),
        "mae": round(float(np.mean(np.abs(errors))), 1),
        "std_dev": round(float(np.std(errors)), 1),
    }
