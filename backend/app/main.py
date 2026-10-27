import logging
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import accuracy, decision, meta, whatif
from app.services.data_loader import DataLoader
from app.services.forecast_selection import select_all_asof_forecasts, select_asof_forecast
from app.services.horizon import compute_horizon_analysis, get_merged_horizon_df
from app.services.metrics import (
    compute_accuracy_summary,
    compute_by_hour_metrics,
    compute_daily_metrics,
    compute_distribution_metrics,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("wind_trader_api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Wind Trading Decision Terminal API...")
    try:
        loader = DataLoader.get_instance()
        logger.info(
            f"Preloaded {len(loader.actuals)} actuals and {len(loader.forecasts)} forecasts."
        )

        # Precompute default 09:00 cutoff data and horizon matrix at startup
        default_cutoff = settings.default_cutoff_time
        eval_dates = (
            pd.date_range(settings.delivery_start_date, settings.delivery_end_date, freq="1D")
            .strftime("%Y-%m-%d")
            .tolist()
        )
        asof_all = select_all_asof_forecasts(
            loader.forecasts, loader.actuals, eval_dates, default_cutoff
        )
        select_asof_forecast(
            loader.forecasts, loader.actuals, "2026-01-15", default_cutoff
        )
        get_merged_horizon_df(loader.forecasts, loader.actuals)
        compute_horizon_analysis(loader.forecasts, loader.actuals, 0.0, 48.0)
        compute_accuracy_summary(asof_all, default_cutoff)
        compute_daily_metrics(asof_all)
        compute_by_hour_metrics(asof_all)
        compute_distribution_metrics(asof_all, 30)

        logger.info("Precomputed default snapshot aggregates and cache warm-up complete.")
    except Exception as exc:
        logger.error(f"Error loading initial dataset snapshots: {exc}", exc_info=True)
    yield
    logger.info("Shutting down Wind Trading API.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Elexon BMRS Wind Power Day-Ahead Trading Decision & Accuracy Platform",
    lifespan=lifespan,
)

# GZip middleware for optimal payload compression
app.add_middleware(GZipMiddleware, minimum_size=500)

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_cache_control_headers(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET" and response.status_code == 200:
        response.headers["Cache-Control"] = "public, max-age=3600"
    return response


# Include routers
app.include_router(meta.router)
app.include_router(decision.router)
app.include_router(accuracy.router)
app.include_router(whatif.router)


@app.get("/", tags=["Root"])
def root_info():
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "status": "operational",
        "docs": "/docs",
        "endpoints": [
            "/health",
            "/api/meta",
            "/api/decision",
            "/api/accuracy/summary",
            "/api/accuracy/daily",
            "/api/accuracy/by-hour",
            "/api/accuracy/by-horizon",
            "/api/accuracy/distribution",
            "/api/whatif",
        ],
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred.", "path": str(request.url.path)},
    )
