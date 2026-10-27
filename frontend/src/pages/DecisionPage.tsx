import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react"

import { api } from "../api/client"
import { MetricCard } from "../components/common/MetricCard"
import { SignConventionBadge } from "../components/common/SignConventionBadge"
import { formatMW } from "../lib/utils"
import { ChartFrame, CHART_MARGIN, SharedTooltip, Y_AXIS_WIDTH } from "../components/charts/ChartFrame"
import { computeAxisDomain, formatTickNumber, getXAxisInterval } from "../lib/chartAxis"
import { getDecisionWindTakeaway, getDecisionThermalTakeaway } from "../lib/insights"

import { useDashboardContext } from "../components/layout/DashboardLayout"

interface DecisionPageProps {
  cutoffTime?: string
  confidenceLevel?: number
  deliveryDate?: string
  setDeliveryDate?: (val: string) => void
}

export const DecisionPage: React.FC<DecisionPageProps> = React.memo((props) => {
  const ctx = useDashboardContext()
  const cutoffTime = props.cutoffTime ?? ctx?.cutoffTime ?? "09:00"
  const confidenceLevel = props.confidenceLevel ?? ctx?.confidenceLevel ?? 0.90
  const deliveryDate = props.deliveryDate ?? ctx?.deliveryDate ?? "2026-01-15"
  const setDeliveryDate = props.setDeliveryDate ?? ctx?.setDeliveryDate ?? (() => {})
  const [demandMw, setDemandMw] = useState<number>(25000)
  const [showTable, setShowTable] = useState<boolean>(false)

  // Fetch metadata for date options
  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: api.getMeta,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch decision data (Note: demand_mw query is fixed at default; what-if is computed client-side)
  const {
    data: decision,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["decision", deliveryDate, cutoffTime, confidenceLevel],
    queryFn: () => api.getDecision(deliveryDate, cutoffTime, confidenceLevel, 25000),
    staleTime: 5 * 60 * 1000,
  })

  // Format date headline
  const formattedDate = useMemo(() => {
    return new Date(deliveryDate).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }, [deliveryDate])

  // Chart data and client-side what-if thermal calculation
  const { chartData, peakThermalWithBuffer, windAxisDomain, thermalAxisDomain } = useMemo(() => {
    if (!decision) {
      return {
        chartData: [],
        peakThermalWithBuffer: 0,
        windAxisDomain: { domain: [0, 1000] as [number, number], ticks: [0, 250, 500, 750, 1000] },
        thermalAxisDomain: { domain: [0, 1000] as [number, number], ticks: [0, 250, 500, 750, 1000] },
      }
    }

    const { rows, buffer_mw } = decision
    const allWindValues: number[] = []
    const allThermalValues: number[] = []

    const data = rows.map((r) => {
      const fc = r.forecast_mw
      const act = r.actual_mw
      const conservativeWind = fc !== null && fc !== undefined ? Math.max(0, fc - buffer_mw) : null

      // Client-side what-if: compute residual thermal directly from current demandMw
      const thermalWithBuffer =
        conservativeWind !== null ? Math.max(0, demandMw - conservativeWind) : demandMw
      const thermalWithoutBuffer = fc !== null && fc !== undefined ? Math.max(0, demandMw - fc) : demandMw

      if (fc !== null && fc !== undefined) allWindValues.push(fc)
      if (act !== null && act !== undefined) allWindValues.push(act)
      if (conservativeWind !== null) allWindValues.push(conservativeWind)

      allThermalValues.push(thermalWithBuffer)
      allThermalValues.push(thermalWithoutBuffer)

      return {
        time: r.hour_label,
        period: r.period,
        forecast: fc,
        actual: act,
        conservativeWind,
        thermalWithBuffer,
        thermalWithoutBuffer,
      }
    })

    const peakThermal = Math.max(...data.map((d) => d.thermalWithBuffer || 0))

    const windDomain = computeAxisDomain(allWindValues, { forceMinZero: true, defaultMax: 5000 })
    const thermalDomain = computeAxisDomain(allThermalValues, { forceMinZero: true, defaultMax: 30000 })

    return {
      chartData: data,
      peakThermalWithBuffer: peakThermal,
      windAxisDomain: windDomain,
      thermalAxisDomain: thermalDomain,
    }
  }, [decision, demandMw])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-[12px] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          ))}
        </div>
        <div className="h-80 rounded-[12px] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
      </div>
    )
  }

  if (isError || !decision) {
    return (
      <div className="p-6 rounded-[12px] clean-card text-center space-y-2">
        <AlertCircle className="w-6 h-6 text-[#DC2626] mx-auto" />
        <h3 className="text-base font-semibold text-[#18181B] dark:text-[#FAFAFA]">
          Unable to load trading decision data
        </h3>
        <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
          {(error as Error)?.message || "Please check backend connection."}
        </p>
      </div>
    )
  }

  const { summary, rows, buffer_mw } = decision

  return (
    <div className="space-y-6 min-w-0">
      {/* 1. Page title + date picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div>
          <h1 className="text-[28px] font-semibold text-[#18181B] dark:text-[#FAFAFA] tracking-tight leading-tight">
            Day-ahead wind & thermal sizing
          </h1>
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-2">
          <label htmlFor="delivery-date-select" className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
            Delivery date:
          </label>
          <select
            id="delivery-date-select"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] text-[13px] focus:ring-2 focus:ring-[#4F46E5] focus:outline-none cursor-pointer"
          >
            {meta?.delivery_dates.map((d) => (
              <option key={d} value={d}>
                {new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. Headline plain-English summary from real numbers */}
      <div className="p-4 rounded-[12px] clean-card text-[14px] text-[#18181B] dark:text-[#FAFAFA] leading-relaxed">
        For <span className="font-semibold">{formattedDate}</span>, wind forecast peaks at{" "}
        <span className="font-semibold tabular-nums">{formatMW(summary.peak_forecast_mw)}</span> against a{" "}
        <span className="font-semibold tabular-nums">{formatMW(summary.peak_actual_mw)}</span> actual outturn, requiring a{" "}
        <span className="font-semibold tabular-nums">{formatMW(buffer_mw)}</span> reserve buffer at{" "}
        <span className="font-semibold">{(confidenceLevel * 100).toFixed(0)}%</span> confidence.
      </div>

      {/* 3. Four KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Forecast peak"
          value={summary.peak_forecast_mw}
          unit="MW"
          decimals={0}
          subtitle={`Total ${Math.round(summary.total_wind_forecast_mwh).toLocaleString()} MWh`}
        />

        <MetricCard
          label="Actual peak"
          value={summary.peak_actual_mw}
          unit="MW"
          decimals={0}
          subtitle={`Total ${Math.round(summary.total_wind_actual_mwh).toLocaleString()} MWh`}
        />

        <MetricCard
          label="Suggested buffer"
          value={buffer_mw}
          unit="MW"
          decimals={0}
          subtitle={`P${(confidenceLevel * 100).toFixed(0)} shortfall protection`}
        />

        <MetricCard
          label="Mean absolute error"
          value={summary.mae}
          unit="MW"
          decimals={0}
          subtitle={`Mean bias ${summary.mean_bias > 0 ? "+" : ""}${Math.round(summary.mean_bias)} MW`}
        />
      </div>

      {/* 4. Large chart card: As-of forecast vs actual, with buffer band using ChartFrame */}
      <ChartFrame
        title="Wind forecast vs actual generation"
        subtitle="Target settlement half-hours across delivery day (D-1 cutoff)"
        unit="MW"
        takeaway={getDecisionWindTakeaway(chartData, buffer_mw)}
        legend={
          <div className="flex items-center gap-4 text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-[#2563EB] rounded-full" /> Forecast
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F97316]" /> Actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 bg-[#2563EB]/15 border border-[#2563EB]/30 rounded-sm" /> Buffer band
            </span>
          </div>
        }
      >
        <AreaChart data={chartData} margin={CHART_MARGIN}>
          <defs>
            <linearGradient id="bufferArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity={0.10} />
              <stop offset="100%" stopColor="#2563EB" stopOpacity={0.10} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" className="dark:stroke-[#27272A]" />
          <XAxis
            dataKey="time"
            stroke="#71717A"
            fontSize={12}
            tickMargin={6}
            interval={getXAxisInterval(chartData.length)}
          />
          <YAxis
            stroke="#71717A"
            fontSize={12}
            width={Y_AXIS_WIDTH}
            domain={windAxisDomain.domain}
            ticks={windAxisDomain.ticks}
            tickFormatter={formatTickNumber}
          />
          <Tooltip
            content={<SharedTooltip unit="MW" />}
            formatter={(val: any, name: any) => [
              `${formatTickNumber(Number(val))} MW`,
              name === "forecast"
                ? "Forecast"
                : name === "actual"
                ? "Actual outturn"
                : "Derated floor",
            ]}
          />
          <Area
            type="monotone"
            dataKey="conservativeWind"
            stroke="#2563EB"
            strokeWidth={1}
            strokeDasharray="3 3"
            fill="url(#bufferArea)"
            name="conservativeWind"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#2563EB"
            strokeWidth={2}
            dot={false}
            name="forecast"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#F97316"
            strokeWidth={2}
            dot={false}
            name="actual"
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartFrame>

      {/* 5. Thermal sizing card using ChartFrame and client-side arithmetic */}
      <ChartFrame
        title="Thermal sizing"
        subtitle="Residual thermal need after deducting conservative wind credit"
        unit="MW"
        takeaway={getDecisionThermalTakeaway(chartData, buffer_mw, peakThermalWithBuffer)}
        headerRight={
          <div className="flex items-center gap-2">
            <label htmlFor="demand-input" className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
              Demand baseline:
            </label>
            <div className="flex items-center gap-1">
              <input
                id="demand-input"
                type="number"
                step="500"
                min="5000"
                max="50000"
                value={demandMw}
                onChange={(e) => setDemandMw(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-24 px-2.5 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] text-[13px] tabular-nums focus:ring-2 focus:ring-[#4F46E5] focus:outline-none"
              />
              <span className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">MW</span>
            </div>
          </div>
        }
        legend={
          <div className="flex items-center gap-4 text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-[#DC2626] rounded-full" /> With buffer
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 border-t border-dashed border-[#71717A]" /> Unhedged
            </span>
          </div>
        }
      >
        <AreaChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" className="dark:stroke-[#27272A]" />
          <XAxis
            dataKey="time"
            stroke="#71717A"
            fontSize={12}
            tickMargin={6}
            interval={getXAxisInterval(chartData.length)}
          />
          <YAxis
            stroke="#71717A"
            fontSize={12}
            width={Y_AXIS_WIDTH}
            domain={thermalAxisDomain.domain}
            ticks={thermalAxisDomain.ticks}
            tickFormatter={formatTickNumber}
          />
          <Tooltip
            content={<SharedTooltip unit="MW" />}
            formatter={(val: any, name: any) => [
              `${formatTickNumber(Number(val))} MW`,
              name === "thermalWithBuffer"
                ? "Thermal need (with buffer)"
                : "Thermal need (unhedged)",
            ]}
          />
          <Line
            type="monotone"
            dataKey="thermalWithBuffer"
            stroke="#DC2626"
            strokeWidth={2}
            dot={false}
            name="thermalWithBuffer"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="thermalWithoutBuffer"
            stroke="#71717A"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            name="thermalWithoutBuffer"
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartFrame>

      {/* 6. Sign convention badge & Collapsible audit table */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <SignConventionBadge />

        <button
          onClick={() => setShowTable(!showTable)}
          className="inline-flex items-center gap-1.5 text-[13px] text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition-colors"
        >
          <span>{showTable ? "Hide 48 settlement periods" : "Audit 48 settlement periods"}</span>
          {showTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Collapsible 48-period Table */}
      {showTable && (
        <div className="rounded-[12px] clean-card overflow-hidden">
          <div className="p-4 border-b border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[#18181B] dark:text-[#FAFAFA]">
              Settlement periods (Jan {formattedDate})
            </h3>
            <span className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
              Cutoff {cutoffTime} UTC on D-1
            </span>
          </div>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-[#FAFAFA] dark:bg-[#18181B] text-[#71717A] dark:text-[#A1A1AA] border-b border-[#E4E4E7] dark:border-[#27272A]">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Period</th>
                  <th className="py-2.5 px-3 font-medium">Target</th>
                  <th className="py-2.5 px-3 font-medium text-right">Forecast (MW)</th>
                  <th className="py-2.5 px-3 font-medium text-right">Actual (MW)</th>
                  <th className="py-2.5 px-3 font-medium text-right">Error (MW)</th>
                  <th className="py-2.5 px-3 font-medium text-right">Thermal required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#27272A]">
                {rows.map((row) => {
                  const isShortfall = row.error_mw !== null && row.error_mw > 0
                  return (
                    <tr key={row.period} className="hover:bg-[#F4F4F5] dark:hover:bg-[#27272A]/50">
                      <td className="py-2 px-3 tabular-nums">{row.period}</td>
                      <td className="py-2 px-3 text-[#71717A] dark:text-[#A1A1AA]">{row.hour_label}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-[#2563EB]">{formatMW(row.forecast_mw)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-[#F97316]">{formatMW(row.actual_mw)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums ${isShortfall ? "text-[#DC2626]" : "text-[#71717A] dark:text-[#A1A1AA]"}`}>
                        {row.error_mw !== null
                          ? `${row.error_mw > 0 ? "+" : ""}${Math.round(row.error_mw)} MW`
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-[#18181B] dark:text-[#FAFAFA]">
                        {formatMW(row.residual_thermal_with_buffer)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
})
