from datetime import datetime

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import settings
from app.models.schemas import DecisionResponse, DecisionSummary, HalfHourRow
from app.services.buffer import compute_empirical_buffer
from app.services.data_loader import DataLoader, get_data_loader
from app.services.forecast_selection import (
    parse_cutoff_datetime,
    select_all_asof_forecasts,
    select_asof_forecast,
)
from app.services.insights import generate_decision_insights

router = APIRouter(prefix="/api", tags=["Trading Decision"])


@router.get("/decision", response_model=DecisionResponse)
def get_decision_data(
    delivery_date: str = Query(default="2026-01-15", description="Delivery date YYYY-MM-DD"),
    cutoff_time: str = Query(default="09:00", description="Cutoff time HH:MM UK time on D-1"),
    confidence_level: float = Query(
        default=0.90, ge=0.50, le=0.99, description="Buffer confidence level"
    ),
    demand_mw: float = Query(default=25000.0, ge=0.0, description="Expected total demand MW"),
    loader: DataLoader = Depends(get_data_loader),
):
    """
    Fetch D-1 as-of wind forecast and actuals for all 48 half-hour settlement periods of delivery_date.
    Includes empirical reserve buffer and residual thermal power requirement.
    """
    # 1. Validate date
    try:
        deliv_dt = datetime.strptime(delivery_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid delivery_date format. Must be YYYY-MM-DD."
        )

    min_date = datetime.strptime(settings.delivery_start_date, "%Y-%m-%d").date()
    max_date = datetime.strptime(settings.delivery_end_date, "%Y-%m-%d").date()
    if deliv_dt < min_date or deliv_dt > max_date:
        raise HTTPException(
            status_code=400,
            detail=f"delivery_date must be between {settings.delivery_start_date} and {settings.delivery_end_date}.",
        )

    # 2. Select as-of forecasts for requested delivery day
    fc_df = loader.forecasts
    act_df = loader.actuals

    day_df = select_asof_forecast(fc_df, act_df, delivery_date, cutoff_time)
    decision_dt, cutoff_dt = parse_cutoff_datetime(delivery_date, cutoff_time)

    # 3. Calculate empirical buffer from January dataset under this cutoff
    # Generate all delivery dates in scope to evaluate historical errors under this cutoff
    eval_dates = (
        pd.date_range(settings.delivery_start_date, settings.delivery_end_date, freq="1D")
        .strftime("%Y-%m-%d")
        .tolist()
    )
    all_asof = select_all_asof_forecasts(fc_df, act_df, eval_dates, cutoff_time)
    buffer_mw, buffer_expl = compute_empirical_buffer(all_asof["error_mw"], confidence_level)

    # 4. Compute half-hour rows with thermal residual
    rows: list[HalfHourRow] = []
    fc_mw_list = []
    act_mw_list = []
    errors_list = []

    for _, row in day_df.iterrows():
        fc_val = row["forecast_mw"]
        act_val = row["actual_mw"]
        err_val = row["error_mw"]

        if fc_val is not None:
            fc_mw_list.append(fc_val)
            # Conservative wind = max(0, fc_val - buffer_mw)
            conservative_wind = max(0.0, fc_val - buffer_mw)
            res_thermal_with = max(0.0, demand_mw - conservative_wind)
            res_thermal_without = max(0.0, demand_mw - fc_val)
        else:
            conservative_wind = None
            res_thermal_with = None
            res_thermal_without = None

        if act_val is not None:
            act_mw_list.append(act_val)

        if err_val is not None:
            errors_list.append(err_val)

        rows.append(
            HalfHourRow(
                period=int(row["period"]),
                startTime=row["startTime"],
                hour_label=row["hour_label"],
                forecast_mw=round(fc_val, 1) if fc_val is not None else None,
                actual_mw=round(act_val, 1) if act_val is not None else None,
                error_mw=round(err_val, 1) if err_val is not None else None,
                buffer_mw=buffer_mw,
                residual_thermal_with_buffer=round(res_thermal_with, 1)
                if res_thermal_with is not None
                else None,
                residual_thermal_without_buffer=round(res_thermal_without, 1)
                if res_thermal_without is not None
                else None,
                has_forecast=bool(row["has_forecast"]),
                publishTime=row["publishTime"],
                lead_time_hours=round(row["lead_time_hours"], 1)
                if row["lead_time_hours"] is not None
                else None,
            )
        )

    # 5. Summary metrics for this delivery day
    if errors_list:
        err_arr = np.array(errors_list)
        mae = float(np.mean(np.abs(err_arr)))
        rmse = float(np.sqrt(np.mean(err_arr**2)))
        bias = float(np.mean(err_arr))
        shortfalls = int(np.sum(err_arr > 0))
    else:
        mae, rmse, bias, shortfalls = 0.0, 0.0, 0.0, 0

    total_periods = len(rows)
    shortfall_rate = (shortfalls / total_periods * 100.0) if total_periods > 0 else 0.0
    peak_fc = max(fc_mw_list) if fc_mw_list else 0.0
    peak_act = max(act_mw_list) if act_mw_list else 0.0
    # Generation in MWh = sum of MW * 0.5h (each settlement period is 30 mins)
    total_fc_mwh = sum(fc_mw_list) * 0.5 if fc_mw_list else 0.0
    total_act_mwh = sum(act_mw_list) * 0.5 if act_mw_list else 0.0

    day_summary = DecisionSummary(
        mae=round(mae, 1),
        rmse=round(rmse, 1),
        mean_bias=round(bias, 1),
        shortfall_periods=shortfalls,
        total_periods=total_periods,
        shortfall_rate_pct=round(shortfall_rate, 1),
        peak_forecast_mw=round(peak_fc, 1),
        peak_actual_mw=round(peak_act, 1),
        total_wind_forecast_mwh=round(total_fc_mwh, 1),
        total_wind_actual_mwh=round(total_act_mwh, 1),
    )

    # 6. Generate plain-language insights
    insights = generate_decision_insights(
        delivery_date=delivery_date,
        cutoff_time=cutoff_time,
        day_summary=day_summary.model_dump(),
        buffer_mw=buffer_mw,
        buffer_conf=confidence_level,
    )

    return DecisionResponse(
        delivery_date=delivery_date,
        decision_date=decision_dt.strftime("%Y-%m-%d"),
        cutoff_time=cutoff_time,
        cutoff_datetime_utc=cutoff_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        buffer_confidence=confidence_level,
        buffer_mw=buffer_mw,
        demand_mw=demand_mw,
        summary=day_summary,
        insights=insights,
        rows=rows,
    )
