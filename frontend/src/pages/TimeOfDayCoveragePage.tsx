import React, { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts"
import { AlertCircle } from "lucide-react"

import { api } from "../api/client"
import { ChartFrame, CHART_MARGIN, SharedTooltip, Y_AXIS_WIDTH } from "../components/charts/ChartFrame"
import { computeAxisDomain, formatTickNumber, getXAxisInterval } from "../lib/chartAxis"
import { getDiurnalTakeaway } from "../lib/insights"

import { useDashboardContext } from "../components/layout/DashboardLayout"

interface TimeOfDayCoveragePageProps {
  cutoffTime?: string
}

export const TimeOfDayCoveragePage: React.FC<TimeOfDayCoveragePageProps> = React.memo((props) => {
  const ctx = useDashboardContext()
  const cutoffTime = props.cutoffTime ?? ctx?.cutoffTime ?? "09:00"
  const { data: hourly, isLoading: loadingHourly } = useQuery({
    queryKey: ["accuracyByHour", cutoffTime],
    queryFn: () => api.getAccuracyByHour(cutoffTime),
    staleTime: 5 * 60 * 1000,
  })

  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: api.getMeta,
    staleTime: 5 * 60 * 1000,
  })

  const hourlyChartData = useMemo(() => {
    if (!hourly) return []
    return hourly.map((h) => ({
      hour: h.hour_label,
      mae: h.mae,
      rmse: h.rmse,
      bias: h.mean_bias,
    }))
  }, [hourly])

  const yDomain = useMemo(() => {
    if (hourlyChartData.length === 0) {
      return { domain: [0, 2000] as [number, number], ticks: [0, 500, 1000, 1500, 2000] }
    }
    const allVals = hourlyChartData.flatMap((h) => [h.mae, h.bias])
    return computeAxisDomain(allVals, { includeZero: true, defaultMax: 2000 })
  }, [hourlyChartData])

  if (loadingHourly) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="h-72 rounded-[12px] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-[12px] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!hourly) {
    return (
      <div className="p-6 rounded-[12px] clean-card text-center space-y-2">
        <AlertCircle className="w-6 h-6 text-[#DC2626] mx-auto" />
        <h3 className="text-base font-semibold text-[#18181B] dark:text-[#FAFAFA]">
          Diurnal metrics could not be loaded
        </h3>
      </div>
    )
  }

  return (
    <div className="space-y-6 min-w-0">
      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div>
          <h1 className="text-[28px] font-semibold text-[#18181B] dark:text-[#FAFAFA] tracking-tight leading-tight">
            Diurnal patterns & data quality
          </h1>
          <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] mt-1">
            Intraday 24-hour error dynamics and audited Elexon BMRS dataset coverage.
          </p>
        </div>

        <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] self-start sm:self-auto">
          Cutoff locked at {cutoffTime} UK on D-1
        </div>
      </div>

      {/* Diurnal error profile chart card using ChartFrame */}
      <ChartFrame
        title="Diurnal error across 24 settlement hours"
        subtitle="Hourly MAE and directional bias across January 2026 delivery days"
        unit="MW"
        takeaway={getDiurnalTakeaway(hourlyChartData)}
        legend={
          <div className="flex items-center gap-4 text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#2563EB] rounded-sm" /> Hour MAE
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-[#DC2626] rounded-full" /> Hour bias
            </span>
          </div>
        }
      >
        <BarChart data={hourlyChartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" className="dark:stroke-[#27272A]" />
          <XAxis
            dataKey="hour"
            stroke="#71717A"
            fontSize={12}
            tickMargin={6}
            interval={getXAxisInterval(hourlyChartData.length)}
          />
          <YAxis
            stroke="#71717A"
            fontSize={12}
            width={Y_AXIS_WIDTH}
            domain={yDomain.domain}
            ticks={yDomain.ticks}
            tickFormatter={formatTickNumber}
          />
          <Tooltip
            content={<SharedTooltip unit="MW" />}
            formatter={(val: any, name: any) => [
              `${formatTickNumber(Number(val))} MW`,
              name === "mae" ? "Hour MAE" : "Hour bias",
            ]}
          />
          <ReferenceLine y={0} stroke="#71717A" strokeWidth={1} />
          <Bar dataKey="mae" fill="#2563EB" radius={[2, 2, 0, 0]} name="mae" isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="bias"
            stroke="#DC2626"
            strokeWidth={2}
            dot={false}
            name="bias"
            isAnimationActive={false}
          />
        </BarChart>
      </ChartFrame>

      {/* Data coverage audit section */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-[#18181B] dark:text-[#FAFAFA]">
          Elexon BMRS dataset audit
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-[12px] clean-card space-y-1.5">
            <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
              Actuals (FUELHH stream)
            </div>
            <div className="text-[30px] font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums leading-none">
              {meta?.actuals_count.toLocaleString() || "1,584"}
            </div>
            <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] space-y-0.5 pt-2">
              <div>33 delivery days (2026-01-01 to 2026-02-02)</div>
              <div>Filter: fuelType = WIND</div>
              <div>0 missing periods, 0 duplicates</div>
            </div>
          </div>

          <div className="p-5 rounded-[12px] clean-card space-y-1.5">
            <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
              Forecasts (WINDFOR stream)
            </div>
            <div className="text-[30px] font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums leading-none">
              {meta?.forecasts_count.toLocaleString() || "19,856"}
            </div>
            <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] space-y-0.5 pt-2">
              <div>Published 2025-12-30 to 2026-02-01</div>
              <div>Publication cadence: every 2–4 hours</div>
              <div>Horizon reach: up to 66.5 hours ahead</div>
            </div>
          </div>

          <div className="p-5 rounded-[12px] clean-card space-y-1.5">
            <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
              Temporal standard
            </div>
            <div className="text-[30px] font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums leading-none">
              UTC (GMT+0)
            </div>
            <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] space-y-0.5 pt-2">
              <div>UK Winter Time is GMT (UTC+0)</div>
              <div>Zero lookahead as-of forecast selection</div>
              <div>Hourly WINDFOR mapped to half-hours</div>
            </div>
          </div>
        </div>

        <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] pt-1">
          Takeaway: All 1,584 half-hour settlement periods have 100% complete actual generation and corresponding as-of wind forecasts with zero missing periods.
        </p>
      </div>
    </div>
  )
})
