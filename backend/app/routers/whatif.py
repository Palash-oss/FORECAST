from datetime import datetime

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import settings
from app.models.schemas import (
    HalfHourRow,
    WhatIfMetricSummary,
    WhatIfRequest,
    WhatIfResponse,
)
from app.services.buffer import compute_empirical_buffer
from app.services.data_loader import DataLoader, get_data_loader
from app.services.forecast_selection import select_all_asof_forecasts, select_asof_forecast
from app.services.insights import generate_whatif_insights

router = APIRouter(prefix="/api", tags=["What-If Scenario"])


def _calculate_whatif_scenario(
    delivery_date: str,
    cutoff_time: str,
    confidence_level: float,
    constant_demand_mw: float | None,
    hourly_demand_mw: list[float] | None,
    loader: DataLoader,
) -> WhatIfResponse:
    # 1. Validate date
    try:
        deliv_dt = datetime.strptime(delivery_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid delivery_date. Format must be YYYY-MM-DD."
        )

    min_date = datetime.strptime(settings.delivery_start_date, "%Y-%m-%d").date()
    max_date = datetime.strptime(settings.delivery_end_date, "%Y-%m-%d").date()
    if deliv_dt < min_date or deliv_dt > max_date:
        raise HTTPException(
            status_code=400,
            detail=f"delivery_date must be between {settings.delivery_start_date} and {settings.delivery_end_date}.",
        )

    # 2. Select as-of forecast
    fc_df = loader.forecasts
    act_df = loader.actuals
    day_df = select_asof_forecast(fc_df, act_df, delivery_date, cutoff_time)

    # 3. Buffer calculation
    eval_dates = (
        pd.date_range(settings.delivery_start_date, settings.delivery_end_date, freq="1D")
        .strftime("%Y-%m-%d")
        .tolist()
    )
    all_asof = select_all_asof_forecasts(fc_df, act_df, eval_dates, cutoff_time)
    buffer_mw, _ = compute_empirical_buffer(all_asof["error_mw"], confidence_level)

    # 4. Resolve 48-period demand array
    demand_array = []
    if hourly_demand_mw and len(hourly_demand_mw) == 24:
        for val in hourly_demand_mw:
            demand_array.extend([float(val), float(val)])
    elif hourly_demand_mw and len(hourly_demand_mw) == 48:
        demand_array = [float(v) for v in hourly_demand_mw]
    else:
        const_val = (
            constant_demand_mw if constant_demand_mw is not None else settings.default_demand_mw
        )
        demand_array = [float(const_val)] * 48

    rows: list[HalfHourRow] = []
    total_demand_mw_list = []
    wind_fc_list = []
    res_with_list = []
    res_without_list = []

    for idx, (_, row) in enumerate(day_df.iterrows()):
        d_val = demand_array[idx]
        total_demand_mw_list.append(d_val)
        fc_val = row["forecast_mw"]
        act_val = row["actual_mw"]
        err_val = row["error_mw"]

        if fc_val is not None:
            wind_fc_list.append(fc_val)
            conservative_wind = max(0.0, fc_val - buffer_mw)
            res_with = max(0.0, d_val - conservative_wind)
            res_without = max(0.0, d_val - fc_val)
            res_with_list.append(res_with)
            res_without_list.append(res_without)
        else:
            res_with = d_val
            res_without = d_val
            res_with_list.append(res_with)
            res_without_list.append(res_without)

        rows.append(
            HalfHourRow(
                period=int(row["period"]),
                startTime=row["startTime"],
                hour_label=row["hour_label"],
                forecast_mw=round(fc_val, 1) if fc_val is not None else None,
                actual_mw=round(act_val, 1) if act_val is not None else None,
                error_mw=round(err_val, 1) if err_val is not None else None,
                buffer_mw=buffer_mw,
                residual_thermal_with_buffer=round(res_with, 1),
                residual_thermal_without_buffer=round(res_without, 1),
                has_forecast=bool(row["has_forecast"]),
                publishTime=row["publishTime"],
                lead_time_hours=round(row["lead_time_hours"], 1)
                if row["lead_time_hours"] is not None
                else None,
            )
        )

    # Calculate MWh metrics (each settlement period is 0.5 hours)
    total_demand_mwh = sum(total_demand_mw_list) * 0.5
    total_wind_fc_mwh = sum(wind_fc_list) * 0.5
    total_thermal_with_mwh = sum(res_with_list) * 0.5
    total_thermal_without_mwh = sum(res_without_list) * 0.5
    buffer_protection_mwh = total_thermal_with_mwh - total_thermal_without_mwh

    metric_summary = WhatIfMetricSummary(
        total_energy_demand_mwh=round(total_demand_mwh, 1),
        wind_forecast_mwh=round(total_wind_fc_mwh, 1),
        buffer_protection_mwh=round(buffer_protection_mwh, 1),
        residual_thermal_with_buffer_mwh=round(total_thermal_with_mwh, 1),
        residual_thermal_without_buffer_mwh=round(total_thermal_without_mwh, 1),
        peak_demand_mw=round(max(total_demand_mw_list), 1),
        peak_residual_with_buffer_mw=round(max(res_with_list), 1),
        peak_residual_without_buffer_mw=round(max(res_without_list), 1),
    )

    insights = generate_whatif_insights(
        delivery_date=delivery_date,
        cutoff_time=cutoff_time,
        metrics=metric_summary.model_dump(),
        buffer_mw=buffer_mw,
        confidence_level=confidence_level,
    )

    return WhatIfResponse(
        delivery_date=delivery_date,
        cutoff_time=cutoff_time,
        confidence_level=confidence_level,
        buffer_mw=buffer_mw,
        metrics=metric_summary,
        insights=insights,
        rows=rows,
    )


@router.get("/whatif", response_model=WhatIfResponse)
def get_whatif_scenario(
    delivery_date: str = Query(default="2026-01-15", description="Delivery date YYYY-MM-DD"),
    cutoff_time: str = Query(default="09:00", description="Cutoff time HH:MM on D-1"),
    confidence_level: float = Query(
        default=0.90, ge=0.50, le=0.99, description="Buffer confidence level"
    ),
    demand_mw: float = Query(default=25000.0, ge=0.0, description="Constant expected demand MW"),
    loader: DataLoader = Depends(get_data_loader),
):
    """GET endpoint for What-If scenario with constant demand."""
    return _calculate_whatif_scenario(
        delivery_date=delivery_date,
        cutoff_time=cutoff_time,
        confidence_level=confidence_level,
        constant_demand_mw=demand_mw,
        hourly_demand_mw=None,
        loader=loader,
    )


@router.post("/whatif", response_model=WhatIfResponse)
def post_whatif_scenario(body: WhatIfRequest, loader: DataLoader = Depends(get_data_loader)):
    """POST endpoint for What-If scenario with custom 24h/48h demand profile."""
    return _calculate_whatif_scenario(
        delivery_date=body.delivery_date,
        cutoff_time=body.cutoff_time,
        confidence_level=body.confidence_level,
        constant_demand_mw=body.constant_demand_mw,
        hourly_demand_mw=body.hourly_demand_mw,
        loader=loader,
    )
