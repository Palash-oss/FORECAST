import pandas as pd
from fastapi import APIRouter, Depends, Query

from app.config import settings
from app.models.schemas import (
    DailyMetricRow,
    DistributionResponse,
    HorizonResponse,
    HourOfDayMetricRow,
    SummaryMetrics,
)
from app.services.data_loader import DataLoader, get_data_loader
from app.services.forecast_selection import select_all_asof_forecasts
from app.services.horizon import compute_horizon_analysis
from app.services.metrics import (
    compute_accuracy_summary,
    compute_by_hour_metrics,
    compute_daily_metrics,
    compute_distribution_metrics,
)

router = APIRouter(prefix="/api/accuracy", tags=["Forecast Accuracy"])


def _get_evaluated_asof_df(loader: DataLoader, cutoff_time: str) -> pd.DataFrame:
    eval_dates = (
        pd.date_range(settings.delivery_start_date, settings.delivery_end_date, freq="1D")
        .strftime("%Y-%m-%d")
        .tolist()
    )
    return select_all_asof_forecasts(loader.forecasts, loader.actuals, eval_dates, cutoff_time)


@router.get("/summary", response_model=SummaryMetrics)
def get_accuracy_summary(
    cutoff_time: str = Query(default="09:00", description="Cutoff time HH:MM on D-1"),
    loader: DataLoader = Depends(get_data_loader),
):
    """Overall forecast accuracy KPIs across January 2026 delivery days."""
    evaluated = _get_evaluated_asof_df(loader, cutoff_time)
    summary_dict = compute_accuracy_summary(evaluated, cutoff_time)
    return SummaryMetrics(**summary_dict)


@router.get("/daily", response_model=list[DailyMetricRow])
def get_accuracy_daily(
    cutoff_time: str = Query(default="09:00", description="Cutoff time HH:MM on D-1"),
    loader: DataLoader = Depends(get_data_loader),
):
    """Daily forecast error metrics trend (MAE, RMSE, Bias, Shortfall Rate)."""
    evaluated = _get_evaluated_asof_df(loader, cutoff_time)
    daily_list = compute_daily_metrics(evaluated)
    return [DailyMetricRow(**item) for item in daily_list]


@router.get("/by-hour", response_model=list[HourOfDayMetricRow])
def get_accuracy_by_hour(
    cutoff_time: str = Query(default="09:00", description="Cutoff time HH:MM on D-1"),
    loader: DataLoader = Depends(get_data_loader),
):
    """Forecast error metrics aggregated by hour-of-day (0..23)."""
    evaluated = _get_evaluated_asof_df(loader, cutoff_time)
    hourly_list = compute_by_hour_metrics(evaluated)
    return [HourOfDayMetricRow(**item) for item in hourly_list]


@router.get("/by-horizon", response_model=HorizonResponse)
def get_accuracy_by_horizon(
    min_horizon: float = Query(default=0.0, ge=0.0, description="Minimum lead time (hours)"),
    max_horizon: float = Query(default=48.0, le=72.0, description="Maximum lead time (hours)"),
    loader: DataLoader = Depends(get_data_loader),
):
    """Error metrics versus forecast lead time (0 to 48 hours)."""
    res = compute_horizon_analysis(loader.forecasts, loader.actuals, min_horizon, max_horizon)
    return HorizonResponse(**res)


@router.get("/distribution", response_model=DistributionResponse)
def get_accuracy_distribution(
    cutoff_time: str = Query(default="09:00", description="Cutoff time HH:MM on D-1"),
    bins: int = Query(default=30, ge=10, le=100, description="Number of histogram bins"),
    loader: DataLoader = Depends(get_data_loader),
):
    """Forecast error histogram distribution and quantile metrics."""
    evaluated = _get_evaluated_asof_df(loader, cutoff_time)
    dist = compute_distribution_metrics(evaluated, num_bins=bins)
    dist["cutoff_time"] = cutoff_time
    return DistributionResponse(**dist)
