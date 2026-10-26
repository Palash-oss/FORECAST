from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    data_loaded: bool
    actuals_count: int
    forecasts_count: int


class MetaResponse(BaseModel):
    app_name: str
    version: str
    decision_dates: list[str]
    delivery_dates: list[str]
    default_delivery_date: str
    default_cutoff_time: str
    default_buffer_confidence: float
    default_demand_mw: float
    actuals_count: int
    forecasts_count: int
    data_updated_at: str
    error_convention: str = "error = forecast - actual (positive = over-forecast = shortfall risk)"


class HalfHourRow(BaseModel):
    period: int
    startTime: str
    hour_label: str
    forecast_mw: float | None = None
    actual_mw: float | None = None
    error_mw: float | None = None
    buffer_mw: float
    residual_thermal_with_buffer: float | None = None
    residual_thermal_without_buffer: float | None = None
    has_forecast: bool
    publishTime: str | None = None
    lead_time_hours: float | None = None


class DecisionSummary(BaseModel):
    mae: float
    rmse: float
    mean_bias: float
    shortfall_periods: int
    total_periods: int
    shortfall_rate_pct: float
    peak_forecast_mw: float
    peak_actual_mw: float
    total_wind_forecast_mwh: float
    total_wind_actual_mwh: float


class DecisionResponse(BaseModel):
    delivery_date: str
    decision_date: str
    cutoff_time: str
    cutoff_datetime_utc: str
    buffer_confidence: float
    buffer_mw: float
    demand_mw: float
    summary: DecisionSummary
    insights: list[str]
    rows: list[HalfHourRow]


class SummaryMetrics(BaseModel):
    mae: float
    rmse: float
    mean_bias: float
    median_ae: float
    p90_ae: float
    p95_ae: float
    p99_ae: float
    shortfall_rate_pct: float
    shortfall_p90_mw: float
    shortfall_p95_mw: float
    mean_actual_mw: float
    normalised_mae_pct: float
    total_evaluated_half_hours: int
    cutoff_time: str
    sample_window: str


class DailyMetricRow(BaseModel):
    delivery_date: str
    mae: float
    rmse: float
    mean_bias: float
    shortfall_rate_pct: float
    shortfall_p90_mw: float
    actual_mean_mw: float
    forecast_mean_mw: float
    total_periods: int
    has_full_coverage: bool


class HourOfDayMetricRow(BaseModel):
    hour: int
    hour_label: str
    mae: float
    rmse: float
    mean_bias: float
    p90_ae: float
    actual_mean_mw: float
    forecast_mean_mw: float
    count: int


class HorizonBucketRow(BaseModel):
    bucket: str
    min_hours: float
    max_hours: float
    mae: float
    rmse: float
    mean_bias: float
    sample_count: int


class HorizonContinuousRow(BaseModel):
    lead_time_hours: float
    mae: float
    rmse: float
    mean_bias: float
    sample_count: int


class HorizonResponse(BaseModel):
    min_horizon_hours: float
    max_horizon_hours: float
    buckets: list[HorizonBucketRow]
    continuous: list[HorizonContinuousRow]
    summary_insight: str


class HistogramBin(BaseModel):
    bin_start: float
    bin_end: float
    bin_center: float
    count: int
    frequency_pct: float
    is_shortfall: bool


class DistributionResponse(BaseModel):
    cutoff_time: str
    total_samples: int
    quantiles: dict[str, float]
    shortfall_quantiles: dict[str, float]
    histogram: list[HistogramBin]
    mean_bias: float
    mae: float
    std_dev: float


class WhatIfRequest(BaseModel):
    delivery_date: str = Field(..., description="Target delivery date YYYY-MM-DD")
    cutoff_time: str = Field(default="09:00", description="Cutoff time HH:MM")
    confidence_level: float = Field(
        default=0.90, ge=0.50, le=0.99, description="Buffer confidence quantile"
    )
    constant_demand_mw: float | None = Field(
        default=25000.0, description="Constant expected demand (MW)"
    )
    hourly_demand_mw: list[float] | None = Field(
        default=None, description="24 hourly demand values in MW"
    )


class WhatIfMetricSummary(BaseModel):
    total_energy_demand_mwh: float
    wind_forecast_mwh: float
    buffer_protection_mwh: float
    residual_thermal_with_buffer_mwh: float
    residual_thermal_without_buffer_mwh: float
    peak_demand_mw: float
    peak_residual_with_buffer_mw: float
    peak_residual_without_buffer_mw: float


class WhatIfResponse(BaseModel):
    delivery_date: str
    cutoff_time: str
    confidence_level: float
    buffer_mw: float
    metrics: WhatIfMetricSummary
    insights: list[str]
    rows: list[HalfHourRow]
