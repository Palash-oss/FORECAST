import type {
  DecisionResponse,
  DistributionResponse,
  HealthResponse,
  HorizonResponse,
  HourOfDayMetricRow,
  DailyMetricRow,
  MetaResponse,
  SummaryMetrics,
  WhatIfResponse,
} from "./types"

const API_BASE = import.meta.env.VITE_API_URL || ""

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...options,
  })

  if (!res.ok) {
    let errorMsg = `Request failed: ${res.status} ${res.statusText}`
    try {
      const errorJson = await res.json()
      if (errorJson && errorJson.detail) {
        errorMsg = typeof errorJson.detail === "string" ? errorJson.detail : JSON.stringify(errorJson.detail)
      }
    } catch {
      // fallback
    }
    throw new Error(errorMsg)
  }

  return res.json()
}

export const api = {
  getHealth: () => request<HealthResponse>("/health"),

  getMeta: () => request<MetaResponse>("/api/meta"),

  getDecision: (
    deliveryDate: string,
    cutoffTime = "09:00",
    confidenceLevel = 0.90,
    demandMw = 25000.0
  ) =>
    request<DecisionResponse>(
      `/api/decision?delivery_date=${encodeURIComponent(deliveryDate)}&cutoff_time=${encodeURIComponent(
        cutoffTime
      )}&confidence_level=${confidenceLevel}&demand_mw=${demandMw}`
    ),

  getAccuracySummary: (cutoffTime = "09:00") =>
    request<SummaryMetrics>(`/api/accuracy/summary?cutoff_time=${encodeURIComponent(cutoffTime)}`),

  getAccuracyDaily: (cutoffTime = "09:00") =>
    request<DailyMetricRow[]>(`/api/accuracy/daily?cutoff_time=${encodeURIComponent(cutoffTime)}`),

  getAccuracyByHour: (cutoffTime = "09:00") =>
    request<HourOfDayMetricRow[]>(`/api/accuracy/by-hour?cutoff_time=${encodeURIComponent(cutoffTime)}`),

  getAccuracyByHorizon: (minHorizon = 0.0, maxHorizon = 48.0) =>
    request<HorizonResponse>(`/api/accuracy/by-horizon?min_horizon=${minHorizon}&max_horizon=${maxHorizon}`),

  getAccuracyDistribution: (cutoffTime = "09:00", bins = 30) =>
    request<DistributionResponse>(
      `/api/accuracy/distribution?cutoff_time=${encodeURIComponent(cutoffTime)}&bins=${bins}`
    ),

  getWhatIf: (
    deliveryDate: string,
    cutoffTime = "09:00",
    confidenceLevel = 0.90,
    demandMw = 25000.0
  ) =>
    request<WhatIfResponse>(
      `/api/whatif?delivery_date=${encodeURIComponent(deliveryDate)}&cutoff_time=${encodeURIComponent(
        cutoffTime
      )}&confidence_level=${confidenceLevel}&demand_mw=${demandMw}`
    ),

  postWhatIf: (data: {
    delivery_date: string
    cutoff_time?: string
    confidence_level?: number
    constant_demand_mw?: number
    hourly_demand_mw?: number[]
  }) =>
    request<WhatIfResponse>("/api/whatif", {
      method: "POST",
      body: JSON.stringify(data),
    }),
}
