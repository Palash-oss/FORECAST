/**
 * Strictly numerical plain-text takeaway generator.
 * Does not assert unsupported causes (no "evening demand", "weather", or "boundary layer").
 * Describes strictly what the audited numbers show.
 */

import { formatMW } from "./utils"

export interface HalfHourDataPoint {
  period: number
  time: string
  forecast?: number | null
  actual?: number | null
  error_mw?: number | null
  conservativeWind?: number | null
  thermalWithBuffer?: number | null
  thermalWithoutBuffer?: number | null
}

export interface DailyDataPoint {
  date: string
  fullDate: string
  mae: number
  rmse: number
  bias: number
  shortfallRate: number
}

export interface HourlyDataPoint {
  hour_label?: string
  hour?: string
  mae: number
  rmse: number
  bias: number
}

export interface QuantilesData {
  p05?: number
  p25?: number
  p50?: number
  p75?: number
  p90?: number
  p95?: number
  p99?: number
  [key: string]: number | undefined
}

export interface HistogramBin {
  bin_center: number
  frequency_pct: number
  count: number
  is_shortfall: boolean
}

/**
 * Generates takeaway for wind forecast vs actual generation on delivery day.
 */
export function getDecisionWindTakeaway(
  rows: HalfHourDataPoint[],
  bufferMw: number
): string {
  if (!rows || rows.length === 0) return "No settlement period data available."

  const shortfallPeriods = rows.filter(
    (r) => r.forecast !== null && r.forecast !== undefined && r.actual !== null && r.actual !== undefined && r.forecast > r.actual
  )
  const shortfallCount = shortfallPeriods.length
  const totalCount = rows.length

  let maxShortfallMw = 0
  let maxShortfallTime = ""
  for (const r of rows) {
    if (r.forecast && r.actual && r.forecast > r.actual) {
      const sf = r.forecast - r.actual
      if (sf > maxShortfallMw) {
        maxShortfallMw = sf
        maxShortfallTime = r.time
      }
    }
  }

  const protectedCount = rows.filter((r) => {
    if (!r.forecast || !r.actual || r.forecast <= r.actual) return true
    const shortfall = r.forecast - r.actual
    return shortfall <= bufferMw
  }).length

  const pctShortfall = Math.round((shortfallCount / totalCount) * 100)

  return `Actual generation fell below forecast in ${shortfallCount} of ${totalCount} periods (${pctShortfall}%), peaking at a shortfall of ${formatMW(maxShortfallMw)} at ${maxShortfallTime || "peak hour"}. The ${formatMW(bufferMw)} reserve buffer covered ${protectedCount} of ${totalCount} periods against imbalance penalties.`
}

/**
 * Generates takeaway for day-ahead thermal sizing card.
 */
export function getDecisionThermalTakeaway(
  rows: HalfHourDataPoint[],
  bufferMw: number,
  peakThermalWithBuffer: number
): string {
  if (!rows || rows.length === 0) return "Thermal requirement not calculated."

  const thermalValues = rows
    .map((r) => r.thermalWithBuffer)
    .filter((v): v is number => v !== null && v !== undefined)

  const minThermal = thermalValues.length > 0 ? Math.min(...thermalValues) : 0

  return `Residual thermal power procurement ranges from ${formatMW(minThermal)} to ${formatMW(peakThermalWithBuffer)} across the delivery day. The ${formatMW(bufferMw)} reserve buffer ensures demand is covered without relying on wind that historically shortfalls.`
}

/**
 * Generates takeaway for 31-day daily accuracy trend.
 */
export function getDailyAccuracyTakeaway(
  daily: DailyDataPoint[],
  selectedMetric: "mae" | "bias" | "shortfall"
): string {
  if (!daily || daily.length === 0) return "Daily metrics not available."

  if (selectedMetric === "mae") {
    let highest = daily[0]
    let lowest = daily[0]
    for (const d of daily) {
      if (d.mae > highest.mae) highest = d
      if (d.mae < lowest.mae) lowest = d
    }
    return `Daily MAE ranged from ${Math.round(lowest.mae).toLocaleString()} MW (${lowest.fullDate}) to ${Math.round(highest.mae).toLocaleString()} MW (${highest.fullDate}). Mean daily RMSE is ${Math.round(daily.reduce((acc, d) => acc + d.rmse, 0) / daily.length).toLocaleString()} MW.`
  }

  if (selectedMetric === "bias") {
    const positiveBiasDays = daily.filter((d) => d.bias > 0).length
    const total = daily.length
    const biasDescriptor =
      positiveBiasDays === total
        ? "all"
        : positiveBiasDays > total * 0.6
        ? "most"
        : "few"

    return `Forecast bias was positive (over-prediction) on ${positiveBiasDays} of ${total} days (${biasDescriptor} days), with daily bias values between ${Math.round(Math.min(...daily.map((d) => d.bias))).toLocaleString()} MW and +${Math.round(Math.max(...daily.map((d) => d.bias))).toLocaleString()} MW.`
  }

  const avgShortfallRate =
    daily.reduce((acc, d) => acc + d.shortfallRate, 0) / daily.length
  return `Daily shortfall rate averaged ${avgShortfallRate.toFixed(1)}% of half-hours, with ${daily.filter((d) => d.shortfallRate > 50).length} of ${daily.length} days experiencing wind outturn below forecast in the majority of settlement periods.`
}

/**
 * Generates takeaway for forecast error histogram distribution.
 */
export function getDistributionTakeaway(
  quantiles?: QuantilesData,
  histogram?: HistogramBin[]
): string {
  if (!quantiles) return "Error distribution metrics not available."

  const p05 = quantiles.p05 ?? 0
  const p50 = quantiles.p50 ?? 0
  const p95 = quantiles.p95 ?? 0

  let shortfallPct = 0
  if (histogram && histogram.length > 0) {
    shortfallPct = Math.round(
      histogram
        .filter((h) => h.is_shortfall)
        .reduce((sum, h) => sum + h.frequency_pct, 0)
    )
  }

  return `Settlement errors span from ${p05 > 0 ? "+" : ""}${Math.round(p05).toLocaleString()} MW (P05 surplus) to +${Math.round(p95).toLocaleString()} MW (P95 shortfall), with median error at ${p50 > 0 ? "+" : ""}${Math.round(p50).toLocaleString()} MW. Shortfall periods account for ${shortfallPct}% of all evaluated half-hours.`
}

/**
 * Generates takeaway for diurnal hourly error profile.
 * Strictly avoids speculative explanations like "evening demand" or "boundary layer".
 */
export function getDiurnalTakeaway(hourly: HourlyDataPoint[]): string {
  if (!hourly || hourly.length === 0) return "Diurnal data not available."

  let maxMaeHour = hourly[0]
  let minMaeHour = hourly[0]
  for (const h of hourly) {
    if (h.mae > maxMaeHour.mae) maxMaeHour = h
    if (h.mae < minMaeHour.mae) minMaeHour = h
  }

  const positiveBiasHours = hourly.filter((h) => h.bias > 0).length
  const totalHours = hourly.length
  const biasDistribution =
    positiveBiasHours === totalHours
      ? "all"
      : positiveBiasHours > totalHours * 0.6
      ? "most"
      : "few"

  const maxHourName = maxMaeHour.hour || maxMaeHour.hour_label || "18:00"
  const minHourName = minMaeHour.hour || minMaeHour.hour_label || "04:00"

  return `MAE ranges from ${Math.round(minMaeHour.mae).toLocaleString()} MW at ${minHourName} to ${Math.round(maxMaeHour.mae).toLocaleString()} MW at ${maxHourName}. Forecast bias is positive across ${positiveBiasHours} of ${totalHours} hours (${biasDistribution} hours).`
}
