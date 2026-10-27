import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts"
import { AlertCircle } from "lucide-react"

import { api } from "../api/client"
import { MetricCard } from "../components/common/MetricCard"
import { ChartFrame, CHART_MARGIN, SharedTooltip, Y_AXIS_WIDTH } from "../components/charts/ChartFrame"
import { computeAxisDomain, formatTickNumber, getXAxisInterval } from "../lib/chartAxis"
import { getDailyAccuracyTakeaway, getDistributionTakeaway } from "../lib/insights"

import { useDashboardContext } from "../components/layout/DashboardLayout"

interface AccuracyPageProps {
  cutoffTime?: string
}

export const AccuracyPage: React.FC<AccuracyPageProps> = React.memo((props) => {
  const ctx = useDashboardContext()
  const cutoffTime = props.cutoffTime ?? ctx?.cutoffTime ?? "09:00"
  const [selectedMetric, setSelectedMetric] = useState<"mae" | "bias" | "shortfall">("mae")

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["accuracySummary", cutoffTime],
    queryFn: () => api.getAccuracySummary(cutoffTime),
    staleTime: 5 * 60 * 1000,
  })

  const { data: daily, isLoading: loadingDaily } = useQuery({
    queryKey: ["accuracyDaily", cutoffTime],
    queryFn: () => api.getAccuracyDaily(cutoffTime),
    staleTime: 5 * 60 * 1000,
  })

  const { data: dist, isLoading: loadingDist } = useQuery({
    queryKey: ["accuracyDistribution", cutoffTime],
    queryFn: () => api.getAccuracyDistribution(cutoffTime, 30),
    staleTime: 5 * 60 * 1000,
  })

  // Memoize daily chart series
  const dailyChartData = useMemo(() => {
    if (!daily) return []
    return daily.map((d) => ({
      date: d.delivery_date.slice(5),
      fullDate: d.delivery_date,
      mae: d.mae,
      rmse: d.rmse,
      bias: d.mean_bias,
      shortfallRate: d.shortfall_rate_pct,
    }))
  }, [daily])

  // Compute dynamic domains for daily chart
  const { maeDomain, biasDomain, shortfallDomain } = useMemo(() => {
    if (dailyChartData.length === 0) {
      return {
        maeDomain: { domain: [0, 2000] as [number, number], ticks: [0, 500, 1000, 1500, 2000] },
        biasDomain: { domain: [-1000, 1000] as [number, number], ticks: [-1000, -500, 0, 500, 1000] },
        shortfallDomain: { domain: [0, 100] as [number, number], ticks: [0, 25, 50, 75, 100] },
      }
    }

    const allMaeRmse = dailyChartData.flatMap((d) => [d.mae, d.rmse])
    const allBias = dailyChartData.map((d) => d.bias)

    return {
      maeDomain: computeAxisDomain(allMaeRmse, { forceMinZero: true, defaultMax: 2000 }),
      biasDomain: computeAxisDomain(allBias, { includeZero: true, defaultMax: 1000 }),
      shortfallDomain: { domain: [0, 100] as [number, number], ticks: [0, 25, 50, 75, 100] },
    }
  }, [dailyChartData])

  // Compute domain for distribution histogram
  const distDomain = useMemo(() => {
    if (!dist || !dist.histogram || dist.histogram.length === 0) {
      return { domain: [0, 200] as [number, number], ticks: [0, 50, 100, 150, 200] }
    }
    const counts = dist.histogram.map((h) => h.count)
    return computeAxisDomain(counts, { forceMinZero: true, defaultMax: 200 })
  }, [dist])

  if (loadingSummary || loadingDaily || loadingDist) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 rounded-[12px] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          ))}
        </div>
        <div className="h-80 rounded-[12px] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
      </div>
    )
  }

  if (!summary || !daily || !dist) {
    return (
      <div className="p-6 rounded-[12px] clean-card text-center space-y-2">
        <AlertCircle className="w-6 h-6 text-[#DC2626] mx-auto" />
        <h3 className="text-base font-semibold text-[#18181B] dark:text-[#FAFAFA]">
          Accuracy metrics could not be loaded
        </h3>
      </div>
    )
  }

  return (
    <div className="space-y-6 min-w-0">
      {/* Title row with metric controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div>
          <h1 className="text-[28px] font-semibold text-[#18181B] dark:text-[#FAFAFA] tracking-tight leading-tight">
            Forecast accuracy & risk distribution
          </h1>
          <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] mt-1">
            Statistical evaluation across 1,584 settlement periods in January 2026 at {cutoffTime} UK cutoff.
          </p>
        </div>

        {/* Metric toggle controls */}
        <div className="flex items-center gap-1 p-1 rounded-lg border border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#18181B] self-start sm:self-auto">
          <button
            onClick={() => setSelectedMetric("mae")}
            className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
              selectedMetric === "mae"
                ? "bg-[#EEF2FF] text-[#4F46E5] dark:bg-[#312E81]/30 dark:text-indigo-400"
                : "text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]"
            }`}
          >
            MAE & RMSE
          </button>
          <button
            onClick={() => setSelectedMetric("bias")}
            className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
              selectedMetric === "bias"
                ? "bg-[#EEF2FF] text-[#4F46E5] dark:bg-[#312E81]/30 dark:text-indigo-400"
                : "text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]"
            }`}
          >
            Mean bias
          </button>
          <button
            onClick={() => setSelectedMetric("shortfall")}
            className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
              selectedMetric === "shortfall"
                ? "bg-[#EEF2FF] text-[#4F46E5] dark:bg-[#312E81]/30 dark:text-indigo-400"
                : "text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]"
            }`}
          >
            Shortfall rate
          </button>
        </div>
      </div>

      {/* 6 clean KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Mean absolute error"
          value={summary.mae}
          unit="MW"
          decimals={0}
          subtitle={`RMSE ${summary.rmse.toFixed(0)} MW`}
        />

        <MetricCard
          label="Normalised error"
          value={summary.normalised_mae_pct}
          unit="%"
          decimals={1}
          subtitle={`Mean wind ${summary.mean_actual_mw.toFixed(0)} MW`}
        />

        <MetricCard
          label="Directional bias"
          value={summary.mean_bias}
          unit="MW"
          decimals={0}
          subtitle={summary.mean_bias > 0 ? "Over-forecast tendency" : "Under-forecast tendency"}
        />

        <MetricCard
          label="Shortfall rate"
          value={summary.shortfall_rate_pct}
          unit="%"
          decimals={1}
          subtitle="Periods where forecast > actual"
        />

        <MetricCard
          label="P90 shortfall"
          value={summary.shortfall_p90_mw}
          unit="MW"
          decimals={0}
          subtitle="90th percentile shortfall"
        />

        <MetricCard
          label="P95 shortfall"
          value={summary.shortfall_p95_mw}
          unit="MW"
          decimals={0}
          subtitle="95th percentile shortfall"
        />
      </div>

      {/* Daily error trend chart card using ChartFrame */}
      <ChartFrame
        title="Daily error trend across 31 delivery days"
        subtitle={`Evaluated at ${cutoffTime} UK cutoff on D-1`}
        unit={selectedMetric === "shortfall" ? "%" : "MW"}
        takeaway={getDailyAccuracyTakeaway(dailyChartData, selectedMetric)}
        legend={
          <div className="flex items-center gap-4 text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
            {selectedMetric === "mae" && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#2563EB] rounded-sm" /> MAE
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-[#F97316] rounded-full" /> RMSE
                </span>
              </>
            )}
            {selectedMetric === "bias" && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#DC2626] rounded-sm" /> Over-forecast (+bias)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#2563EB] rounded-sm" /> Under-forecast (-bias)
                </span>
              </>
            )}
            {selectedMetric === "shortfall" && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-[#DC2626] rounded-full" /> % of periods short
              </span>
            )}
          </div>
        }
      >
        {selectedMetric === "mae" ? (
          <BarChart data={dailyChartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" className="dark:stroke-[#27272A]" />
            <XAxis
              dataKey="date"
              stroke="#71717A"
              fontSize={12}
              tickMargin={6}
              interval={getXAxisInterval(dailyChartData.length)}
            />
            <YAxis
              stroke="#71717A"
              fontSize={12}
              width={Y_AXIS_WIDTH}
              domain={maeDomain.domain}
              ticks={maeDomain.ticks}
              tickFormatter={formatTickNumber}
            />
            <Tooltip
              content={<SharedTooltip unit="MW" />}
              formatter={(val: any, name: any) => [`${formatTickNumber(Number(val))} MW`, String(name).toUpperCase()]}
              labelFormatter={(lbl, payload) => payload?.[0]?.payload?.fullDate || lbl}
            />
            <Bar dataKey="mae" fill="#2563EB" radius={[2, 2, 0, 0]} name="MAE" isAnimationActive={false} />
            <Line type="monotone" dataKey="rmse" stroke="#F97316" strokeWidth={2} dot={false} name="RMSE" isAnimationActive={false} />
          </BarChart>
        ) : selectedMetric === "bias" ? (
          <BarChart data={dailyChartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" className="dark:stroke-[#27272A]" />
            <XAxis
              dataKey="date"
              stroke="#71717A"
              fontSize={12}
              tickMargin={6}
              interval={getXAxisInterval(dailyChartData.length)}
            />
            <YAxis
              stroke="#71717A"
              fontSize={12}
              width={Y_AXIS_WIDTH}
              domain={biasDomain.domain}
              ticks={biasDomain.ticks}
              tickFormatter={formatTickNumber}
            />
            <Tooltip
              content={<SharedTooltip unit="MW" />}
              formatter={(val: any) => [
                `${Number(val) > 0 ? "+" : ""}${formatTickNumber(Number(val))} MW (${Number(val) > 0 ? "Over-forecast" : "Under-forecast"})`,
                "Mean bias",
              ]}
              labelFormatter={(lbl, payload) => payload?.[0]?.payload?.fullDate || lbl}
            />
            <ReferenceLine y={0} stroke="#71717A" strokeWidth={1} />
            <Bar dataKey="bias" radius={[2, 2, 0, 0]} name="Bias" isAnimationActive={false}>
              {dailyChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.bias > 0 ? "#DC2626" : "#2563EB"} />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <LineChart data={dailyChartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" className="dark:stroke-[#27272A]" />
            <XAxis
              dataKey="date"
              stroke="#71717A"
              fontSize={12}
              tickMargin={6}
              interval={getXAxisInterval(dailyChartData.length)}
            />
            <YAxis
              stroke="#71717A"
              fontSize={12}
              width={Y_AXIS_WIDTH}
              domain={shortfallDomain.domain}
              ticks={shortfallDomain.ticks}
              tickFormatter={formatTickNumber}
            />
            <Tooltip
              content={<SharedTooltip unit="%" />}
              formatter={(val: any) => [`${Number(val).toFixed(1)}% of half-hours`, "Shortfall rate"]}
              labelFormatter={(lbl, payload) => payload?.[0]?.payload?.fullDate || lbl}
            />
            <ReferenceLine y={50} stroke="#71717A" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="shortfallRate"
              stroke="#DC2626"
              strokeWidth={2}
              dot={false}
              name="Shortfall rate"
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ChartFrame>

      {/* Error distribution histogram using ChartFrame */}
      <ChartFrame
        title="Forecast error distribution"
        subtitle="1,584 half-hour settlement errors partitioned into 30 histogram bins"
        unit="Half-hours"
        takeaway={getDistributionTakeaway(dist.quantiles, dist.histogram)}
        legend={
          <div className="flex items-center gap-4 text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#2563EB] rounded-sm" /> Surplus (negative error)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#DC2626] rounded-sm" /> Shortfall (positive error)
            </span>
          </div>
        }
      >
        <BarChart data={dist.histogram} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" className="dark:stroke-[#27272A]" />
          <XAxis
            dataKey="bin_center"
            stroke="#71717A"
            fontSize={12}
            tickMargin={6}
            interval={getXAxisInterval(dist.histogram.length)}
            tickFormatter={(v) => `${Number(v) > 0 ? "+" : ""}${formatTickNumber(Number(v))}`}
          />
          <YAxis
            stroke="#71717A"
            fontSize={12}
            width={Y_AXIS_WIDTH}
            domain={distDomain.domain}
            ticks={distDomain.ticks}
            tickFormatter={formatTickNumber}
          />
          <Tooltip
            content={<SharedTooltip unit="half-hours" />}
            formatter={(val: any, _, item: any) => [
              `${formatTickNumber(Number(val))} half-hours (${item?.payload?.frequency_pct}%)`,
              `Bin [${item?.payload?.bin_start} to ${item?.payload?.bin_end} MW]`,
            ]}
          />
          <ReferenceLine x={0} stroke="#71717A" strokeWidth={1} />
          <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {dist.histogram.map((entry, index) => (
              <Cell key={`hist-${index}`} fill={entry.is_shortfall ? "#DC2626" : "#2563EB"} />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>

      {/* Quantile summary card */}
      <div className="p-4 rounded-[12px] clean-card space-y-3">
        <h3 className="text-sm font-semibold text-[#18181B] dark:text-[#FAFAFA]">
          Statistical quantiles of forecast error
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[13px]">
          <div className="p-2.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A]">
            <span className="text-[#71717A] dark:text-[#A1A1AA] block text-[12px]">P05 (Surplus)</span>
            <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums mt-0.5 block">{dist.quantiles.p05} MW</span>
          </div>
          <div className="p-2.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A]">
            <span className="text-[#71717A] dark:text-[#A1A1AA] block text-[12px]">P25</span>
            <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums mt-0.5 block">{dist.quantiles.p25} MW</span>
          </div>
          <div className="p-2.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A]">
            <span className="text-[#71717A] dark:text-[#A1A1AA] block text-[12px]">P50 (Median)</span>
            <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums mt-0.5 block">{dist.quantiles.p50} MW</span>
          </div>
          <div className="p-2.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A]">
            <span className="text-[#71717A] dark:text-[#A1A1AA] block text-[12px]">P75</span>
            <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums mt-0.5 block">{dist.quantiles.p75} MW</span>
          </div>
          <div className="p-2.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A]">
            <span className="text-[#71717A] dark:text-[#A1A1AA] block text-[12px]">P90 (Shortfall)</span>
            <span className="font-semibold text-[#DC2626] tabular-nums mt-0.5 block">{dist.quantiles.p90} MW</span>
          </div>
          <div className="p-2.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A]">
            <span className="text-[#71717A] dark:text-[#A1A1AA] block text-[12px]">P95</span>
            <span className="font-semibold text-[#DC2626] tabular-nums mt-0.5 block">{dist.quantiles.p95} MW</span>
          </div>
          <div className="p-2.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A]">
            <span className="text-[#71717A] dark:text-[#A1A1AA] block text-[12px]">P99</span>
            <span className="font-semibold text-[#DC2626] tabular-nums mt-0.5 block">{dist.quantiles.p99} MW</span>
          </div>
        </div>
      </div>
    </div>
  )
})
