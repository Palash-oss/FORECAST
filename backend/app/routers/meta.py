from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from app.config import settings
from app.models.schemas import HealthResponse, MetaResponse
from app.services.data_loader import DataLoader, get_data_loader

router = APIRouter(tags=["Metadata & System"])


@router.get("/health", response_model=HealthResponse)
@router.get("/api/health", response_model=HealthResponse)
def get_health(loader: DataLoader = Depends(get_data_loader)):
    act = loader.actuals
    fc = loader.forecasts
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        data_loaded=not act.empty and not fc.empty,
        actuals_count=len(act),
        forecasts_count=len(fc),
    )


@router.get("/api/meta", response_model=MetaResponse)
def get_metadata(loader: DataLoader = Depends(get_data_loader)):
    # Generate list of delivery dates: 2026-01-02 to 2026-02-01
    import pandas as pd

    deliv_dates = (
        pd.date_range(settings.delivery_start_date, settings.delivery_end_date, freq="1D")
        .strftime("%Y-%m-%d")
        .tolist()
    )
    decis_dates = (
        pd.date_range(settings.decision_start_date, settings.decision_end_date, freq="1D")
        .strftime("%Y-%m-%d")
        .tolist()
    )

    meta_info = loader.metadata
    updated_at = meta_info.get("updated_at", datetime.now(UTC).isoformat())

    return MetaResponse(
        app_name=settings.app_name,
        version=settings.app_version,
        decision_dates=decis_dates,
        delivery_dates=deliv_dates,
        default_delivery_date="2026-01-15",
        default_cutoff_time=settings.default_cutoff_time,
        default_buffer_confidence=settings.default_buffer_confidence,
        default_demand_mw=settings.default_demand_mw,
        actuals_count=len(loader.actuals),
        forecasts_count=len(loader.forecasts),
        data_updated_at=updated_at,
        error_convention="error = forecast - actual (positive = over-forecast = shortfall risk for buyer)",
    )
