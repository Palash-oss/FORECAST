import React, { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts"
import { AlertCircle } from "lucide-react"

import { api } from "../api/client"
import { formatMW } from "../lib/utils"
import { ChartFrame, CHART_MARGIN, SharedTooltip, Y_AXIS_WIDTH } from "../components/charts/ChartFrame"
import { computeAxisDomain, formatTickNumber, getXAxisInterval } from "../lib/chartAxis"

import { useDashboardContext } from "../components/layout/DashboardLayout"

interface HorizonPageProps {
  minHorizon?: number
  maxHorizon?: number
  setMinHorizon?: (val: number) => void
  setMaxHorizon?: (val: number) => void
}

export const HorizonPage: React.FC<HorizonPageProps> = React.memo((props) => {
  const ctx = useDashboardContext()
  const minHorizon = props.minHorizon ?? ctx?.minHorizon ?? 0
  const maxHorizon = props.maxHorizon ?? ctx?.maxHorizon ?? 48
  const setMinHorizon = props.setMinHorizon ?? ctx?.setMinHorizon ?? (() => {})
  const setMaxHorizon = props.setMaxHorizon ?? ctx?.setMaxHorizon ?? (() => {})
  const { data: horizonData, isLoading, isError, error } = useQuery({
    queryKey: ["accuracyHorizon", minHorizon, maxHorizon],
    queryFn: () => api.getAccuracyByHorizon(minHorizon, maxHorizon),
    staleTime: 5 * 60 * 1000,
  })

  const { buckets, continuous, summary_insight } = horizonData || {
    buckets: [],
    continuous: [],
    summary_insight: "",
  }

  // Compute dynamic YAxis domain including negative bias values
  const yDomain = useMemo(() => {
    if (!continuous || continuous.length === 0) {
      return { domain: [0, 2000] as [number, number], ticks: [0, 500, 1000, 1500, 2000] }
    }
    const allValues = continuous.flatMap((c) => [c.mae, c.rmse, c.mean_bias])
    return computeAxisDomain(allValues, { includeZero: true, defaultMax: 2000 })
  }, [continuous])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-[12px] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          ))}
        </div>
        <div className="h-80 rounded-[12px] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
      </div>
    )
  }

  if (isError || !horizonData) {
    return (
      <div className="p-6 rounded-[12px] clean-card text-center space-y-2">
        <AlertCircle className="w-6 h-6 text-[#DC2626] mx-auto" />
        <h3 className="text-base font-semibold text-[#18181B] dark:text-[#FAFAFA]">
          Horizon metrics could not be loaded
        </h3>
        <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">{(error as Error)?.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 min-w-0">
      {/* Title row with controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div>
          <h1 className="text-[28px] font-semibold text-[#18181B] dark:text-[#FAFAFA] tracking-tight leading-tight">
            Forecast degradation vs lead time
          </h1>
          <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] mt-1">
            Analysis of forecast error growth as decision horizon extends from 0 to 48 hours.
          </p>
        </div>

        {/* Lead time range controls */}
        <div className="flex items-center gap-2 p-2 rounded-lg border border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#18181B] text-[13px] self-start sm:self-auto">
          <span className="text-[#71717A] dark:text-[#A1A1AA]">Horizon:</span>
          <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums">
            {minHorizon}h–{maxHorizon}h
          </span>
          <input
            type="range"
            min="0"
            max="24"
            step="1"
            value={minHorizon}
            onChange={(e) => setMinHorizon(Math.min(parseFloat(e.target.value), maxHorizon - 6))}
            className="w-16 accent-[#4F46E5] cursor-pointer"
            title="Min horizon"
          />
          <input
            type="range"
            min="24"
            max="48"
            step="1"
            value={maxHorizon}
            onChange={(e) => setMaxHorizon(Math.max(parseFloat(e.target.value), minHorizon + 6))}
            className="w-16 accent-[#4F46E5] cursor-pointer"
            title="Max horizon"
          />
        </div>
      </div>

      {/* 5 clean bucket cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {buckets.map((b) => (
          <div key={b.bucket} className="p-4 rounded-[12px] clean-card space-y-1">
            <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] font-normal">
              {b.bucket.toLowerCase()}
            </div>
            <div className="text-[30px] font-semibold tracking-tight tabular-nums text-[#18181B] dark:text-[#FAFAFA] leading-none">
              {formatMW(b.mae)}
            </div>
            <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] font-normal pt-1">
              RMSE {Math.round(b.rmse)} MW • Bias {b.mean_bias > 0 ? "+" : ""}{Math.round(b.mean_bias)} MW
            </div>
          </div>
        ))}
      </div>

      {/* Continuous degradation chart card using ChartFrame */}
      <ChartFrame
        title="Hourly error degradation curve (1h to 48h lead time)"
        subtitle="Evaluated across all published forecast vintages matching hourly metered actuals"
        unit="MW"
        takeaway={summary_insight}
        legend={
          <div className="flex items-center gap-4 text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-[#2563EB] rounded-full" /> MAE
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-[#F97316] rounded-full" /> RMSE
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 border-t border-dashed border-[#DC2626]" /> Bias
            </span>
          </div>
        }
      >
        <LineChart data={continuous} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" className="dark:stroke-[#27272A]" />
          <XAxis
            dataKey="lead_time_hours"
            stroke="#71717A"
            fontSize={12}
            tickFormatter={(v) => `${v}h`}
            tickMargin={6}
            interval={getXAxisInterval(continuous.length)}
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
              name === "mae" ? "MAE" : name === "rmse" ? "RMSE" : "Bias",
            ]}
            labelFormatter={(lbl) => `Lead time: ${lbl}h ahead`}
          />
          <ReferenceLine
            x={15}
            stroke="#71717A"
            strokeDasharray="4 4"
            label={{ value: "D-1 09:00 cutoff (15h-39h)", fill: "#71717A", fontSize: 11, position: "top" }}
          />
          <ReferenceLine y={0} stroke="#71717A" strokeWidth={1} />
          <Line
            type="monotone"
            dataKey="mae"
            stroke="#2563EB"
            strokeWidth={2}
            dot={false}
            name="mae"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="rmse"
            stroke="#F97316"
            strokeWidth={2}
            dot={false}
            name="rmse"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="mean_bias"
            stroke="#DC2626"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={false}
            name="mean_bias"
            isAnimationActive={false}
          />
        </LineChart>
      </ChartFrame>
    </div>
  )
})
