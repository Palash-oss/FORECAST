"""
Forecast Selection Service.
Implements the core decision-time as-of forecast selection algorithm:
For delivery day D and decision cutoff (default D-1 09:00 UK time), chooses
the latest published forecast vintage with publishTime <= cutoff.
Never leaks information published after the cutoff.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import pandas as pd


def parse_cutoff_datetime(
    delivery_date_str: str, cutoff_time_str: str = "09:00"
) -> tuple[datetime, datetime]:
    """
    Given delivery date (YYYY-MM-DD) and cutoff time (HH:MM), returns:
    (decision_date, cutoff_datetime_utc)
    Decision date is D-1.
    """
    delivery_dt = datetime.strptime(delivery_date_str, "%Y-%m-%d").replace(tzinfo=UTC)
    decision_dt = delivery_dt - timedelta(days=1)

    parts = cutoff_time_str.strip().split(":")
    hour = int(parts[0])
    minute = int(parts[1]) if len(parts) > 1 else 0

    cutoff_datetime = decision_dt.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return decision_dt, cutoff_datetime


_DAY_ASOF_CACHE: dict[tuple[str, str], pd.DataFrame] = {}


def select_asof_forecast(
    forecasts_df: pd.DataFrame,
    actuals_df: pd.DataFrame | None,
    delivery_date: str,
    cutoff_time: str = "09:00",
) -> pd.DataFrame:
    """
    Select as-of wind forecast for all 48 half-hour settlement periods of delivery_date.

    Parameters:
    - forecasts_df: DataFrame of WINDFOR stream with columns [publishTime, startTime, generation]
    - actuals_df: Optional DataFrame of FUELHH stream with columns [startTime, generation, settlementPeriod]
    - delivery_date: Delivery date YYYY-MM-DD
    - cutoff_time: HH:MM on D-1 (UK time / GMT in January)

    Returns:
    - pd.DataFrame with 48 half-hour rows:
      [period, startTime, forecast_mw, actual_mw, error_mw, has_forecast, publishTime, lead_time_hours]
    """
    cache_key = (id(forecasts_df), len(forecasts_df), delivery_date, cutoff_time)
    if cache_key in _DAY_ASOF_CACHE:
        return _DAY_ASOF_CACHE[cache_key].copy()

    decision_dt, cutoff_dt = parse_cutoff_datetime(delivery_date, cutoff_time)

    # 1. Strictly enforce no lookahead: only forecasts published AT OR BEFORE cutoff
    eligible = forecasts_df[forecasts_df["publishTime"] <= cutoff_dt]

    # 2. Build 48 target half-hours for delivery date D (00:00 to 23:30)
    delivery_start = datetime.strptime(delivery_date, "%Y-%m-%d").replace(tzinfo=UTC)
    target_times = [delivery_start + timedelta(minutes=30 * i) for i in range(48)]

    rows: list[dict[str, Any]] = []

    # Map actuals to dict for O(1) lookup
    actuals_map: dict[datetime, tuple[float, int]] = {}
    if actuals_df is not None and not actuals_df.empty:
        # Filter to delivery day actuals
        day_actuals = actuals_df[
            (actuals_df["startTime"] >= delivery_start)
            & (actuals_df["startTime"] < delivery_start + timedelta(days=1))
        ]
        for _, row in day_actuals.iterrows():
            actuals_map[row["startTime"]] = (
                float(row["generation"]),
                int(row.get("settlementPeriod", 0)),
            )

    # Fast indexed lookup for eligible forecasts
    # Since WINDFOR is hourly, each half-hour matches the hour floor
    # We group eligible forecasts by startTime and pick the row with max publishTime
    latest_forecasts_by_hour: dict[datetime, dict[str, Any]] = {}
    if not eligible.empty:
        # Sort by publishTime ascending so last row per startTime is latest
        sorted_eligible = eligible.sort_values("publishTime")
        for st, group in sorted_eligible.groupby("startTime"):
            latest_row = group.iloc[-1]
            latest_forecasts_by_hour[st] = {
                "generation": float(latest_row["generation"]),
                "publishTime": latest_row["publishTime"],
            }

    for idx, target_dt in enumerate(target_times, start=1):
        target_hour = target_dt.replace(minute=0, second=0, microsecond=0)

        forecast_item = latest_forecasts_by_hour.get(target_hour)
        if forecast_item is not None:
            forecast_mw = forecast_item["generation"]
            pub_dt = forecast_item["publishTime"]
            lead_time = (target_dt - pub_dt).total_seconds() / 3600.0
            has_fc = True
            pub_str = (
                pub_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                if isinstance(pub_dt, datetime)
                else str(pub_dt)
            )
        else:
            forecast_mw = None
            pub_str = None
            lead_time = None
            has_fc = False

        act_tuple = actuals_map.get(target_dt)
        if act_tuple is not None:
            actual_mw, period_num = act_tuple
            period = period_num if period_num > 0 else idx
        else:
            actual_mw = None
            period = idx

        # Error convention: error = forecast - actual (positive = over-forecast / shortfall)
        if forecast_mw is not None and actual_mw is not None:
            error_mw = forecast_mw - actual_mw
        else:
            error_mw = None

        hour_label = target_dt.strftime("%H:%M")

        rows.append(
            {
                "period": int(period),
                "startTime": target_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "target_datetime": target_dt,
                "hour_label": hour_label,
                "forecast_mw": forecast_mw,
                "actual_mw": actual_mw,
                "error_mw": error_mw,
                "has_forecast": bool(has_fc),
                "publishTime": pub_str,
                "lead_time_hours": lead_time,
            }
        )

    df_result = pd.DataFrame(rows)
    _DAY_ASOF_CACHE[cache_key] = df_result
    return df_result.copy()


_ASOF_EVAL_CACHE: dict[str, pd.DataFrame] = {}


def select_all_asof_forecasts(
    forecasts_df: pd.DataFrame,
    actuals_df: pd.DataFrame,
    delivery_dates: list[str],
    cutoff_time: str = "09:00",
) -> pd.DataFrame:
    """
    Run as-of selection across an entire list of delivery dates with caching.
    Used for aggregate accuracy metrics, distribution analysis, and daily trends.
    """
    cache_key = f"{cutoff_time}_{min(delivery_dates)}_{max(delivery_dates)}_{len(delivery_dates)}"
    if cache_key in _ASOF_EVAL_CACHE:
        return _ASOF_EVAL_CACHE[cache_key]

    dfs = []
    for d in delivery_dates:
        df_day = select_asof_forecast(forecasts_df, actuals_df, d, cutoff_time)
        df_day["delivery_date"] = d
        dfs.append(df_day)
    if dfs:
        res = pd.concat(dfs, ignore_index=True)
        _ASOF_EVAL_CACHE[cache_key] = res
        return res
    return pd.DataFrame()
