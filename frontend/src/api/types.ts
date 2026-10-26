export interface HealthResponse {
  status: string
  version: string
  data_loaded: boolean
  actuals_count: number
  forecasts_count: number
}

export interface MetaResponse {
  app_name: string
  version: string
  decision_dates: string[]
  delivery_dates: string[]
  default_delivery_date: string
  default_cutoff_time: string
  default_buffer_confidence: number
  default_demand_mw: number
  actuals_count: number
  forecasts_count: number
  data_updated_at: string
  error_convention: string
}

export interface HalfHourRow {
  period: number
  startTime: string
  hour_label: string
  forecast_mw: number | null
  actual_mw: number | null
  error_mw: number | null
  buffer_mw: number
  residual_thermal_with_buffer: number | null
  residual_thermal_without_buffer: number | null
  has_forecast: boolean
  publishTime: string | null
  lead_time_hours: number | null
}

export interface DecisionSummary {
  mae: number
  rmse: number
  mean_bias: number
  shortfall_periods: number
  total_periods: number
  shortfall_rate_pct: number
  peak_forecast_mw: number
  peak_actual_mw: number
  total_wind_forecast_mwh: number
  total_wind_actual_mwh: number
}

export interface DecisionResponse {
  delivery_date: string
  decision_date: string
  cutoff_time: string
  cutoff_datetime_utc: string
  buffer_confidence: number
  buffer_mw: number
  demand_mw: number
  summary: DecisionSummary
  insights: string[]
  rows: HalfHourRow[]
}

export interface SummaryMetrics {
  mae: number
  rmse: number
  mean_bias: number
  median_ae: number
  p90_ae: number
  p95_ae: number
  p99_ae: number
  shortfall_rate_pct: number
  shortfall_p90_mw: number
  shortfall_p95_mw: number
  mean_actual_mw: number
  normalised_mae_pct: number
  total_evaluated_half_hours: number
  cutoff_time: string
  sample_window: string
}

export interface DailyMetricRow {
  delivery_date: string
  mae: number
  rmse: number
  mean_bias: number
  shortfall_rate_pct: number
  shortfall_p90_mw: number
  actual_mean_mw: number
  forecast_mean_mw: number
  total_periods: number
  has_full_coverage: boolean
}

export interface HourOfDayMetricRow {
  hour: number
  hour_label: string
  mae: number
  rmse: number
  mean_bias: number
  p90_ae: number
  actual_mean_mw: number
  forecast_mean_mw: number
  count: number
}

export interface HorizonBucketRow {
  bucket: string
  min_hours: number
  max_hours: number
  mae: number
  rmse: number
  mean_bias: number
  sample_count: number
}

export interface HorizonContinuousRow {
  lead_time_hours: number
  mae: number
  rmse: number
  mean_bias: number
  sample_count: number
}

export interface HorizonResponse {
  min_horizon_hours: number
  max_horizon_hours: number
  buckets: HorizonBucketRow[]
  continuous: HorizonContinuousRow[]
  summary_insight: string
}

export interface HistogramBin {
  bin_start: number
  bin_end: number
  bin_center: number
  count: number
  frequency_pct: number
  is_shortfall: boolean
}

export interface DistributionResponse {
  cutoff_time: string
  total_samples: number
  quantiles: Record<string, number>
  shortfall_quantiles: Record<string, number>
  histogram: HistogramBin[]
  mean_bias: number
  mae: number
  std_dev: number
}

export interface WhatIfMetricSummary {
  total_energy_demand_mwh: number
  wind_forecast_mwh: number
  buffer_protection_mwh: number
  residual_thermal_with_buffer_mwh: number
  residual_thermal_without_buffer_mwh: number
  peak_demand_mw: number
  peak_residual_with_buffer_mw: number
  peak_residual_without_buffer_mw: number
}

export interface WhatIfResponse {
  delivery_date: string
  cutoff_time: string
  confidence_level: number
  buffer_mw: number
  metrics: WhatIfMetricSummary
  insights: string[]
  rows: HalfHourRow[]
}
