import React from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Moon, Sun } from "lucide-react"
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

import { api } from "../api/client"
import { formatMW } from "../lib/utils"
import { SharedTooltip, CHART_MARGIN, Y_AXIS_WIDTH } from "../components/charts/ChartFrame"
import { computeAxisDomain, formatTickNumber, getXAxisInterval } from "../lib/chartAxis"

interface LandingPageProps {
  isDark: boolean
  toggleTheme: (val: boolean) => void
}

export const LandingPage: React.FC<LandingPageProps> = ({ isDark, toggleTheme }) => {
  // 1. Fetch live summary for real key-numbers strip
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["accuracySummary", "09:00"],
    queryFn: () => api.getAccuracySummary("09:00"),
    staleTime: 5 * 60 * 1000,
  })

  // 2. Fetch sample day decision data for live preview chart
  const { data: sampleDecision, isLoading: loadingSample } = useQuery({
    queryKey: ["decision", "2026-01-15", "09:00", 0.90],
    queryFn: () => api.getDecision("2026-01-15", "09:00", 0.90, 25000),
    staleTime: 5 * 60 * 1000,
  })

  const previewData = React.useMemo(() => {
    if (!sampleDecision) return []
    return sampleDecision.rows.map((r) => ({
      time: r.hour_label,
      forecast: r.forecast_mw,
      actual: r.actual_mw,
      conservativeWind:
        r.forecast_mw !== null && r.forecast_mw !== undefined
          ? Math.max(0, r.forecast_mw - sampleDecision.buffer_mw)
          : null,
    }))
  }, [sampleDecision])

  const previewDomain = React.useMemo(() => {
    if (previewData.length === 0) {
      return { domain: [0, 5000] as [number, number], ticks: [0, 1000, 2000, 3000, 4000, 5000] }
    }
    const vals = previewData.flatMap((d) => [d.forecast, d.actual, d.conservativeWind])
    return computeAxisDomain(vals, { forceMinZero: true, defaultMax: 5000 })
  }, [previewData])

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] text-[#18181B] dark:text-[#FAFAFA] flex flex-col font-sans">
      {/* Landing Header: product name on left, theme toggle and 'Open dashboard' on right */}
      <header className="w-full border-b border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#09090B]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#4F46E5]" />
            <span className="font-semibold text-[15px] tracking-tight text-[#18181B] dark:text-[#FAFAFA]">
              Wind Forecast Desk
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleTheme(!isDark)}
              className="p-1.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition-colors"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[13px] font-medium transition-colors"
            >
              <span>Open dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main hero body */}
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-16">
        {/* Hero Section */}
        <section className="space-y-6 max-w-3xl">
          <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-semibold text-[#18181B] dark:text-[#FAFAFA] tracking-tight leading-[1.1]">
            Know how much wind to trust before you buy.
          </h1>

          <p className="text-base sm:text-lg text-[#71717A] dark:text-[#A1A1AA] leading-relaxed max-w-2xl">
            Evaluate D-1 wind forecast reliability against audited Elexon BMRS outturn to size empirical thermal reserve buffers and protect trading desks from balancing mechanism shortfalls.
          </p>

          <div className="flex items-center gap-4 pt-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[14px] font-medium transition-colors shadow-sm"
            >
              <span>Open dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <a
              href="#how-it-works"
              className="text-[14px] font-medium text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition-colors px-3 py-2"
            >
              How it works
            </a>
          </div>
        </section>

        {/* Live Key Numbers Strip below Hero */}
        <section className="space-y-3">
          <div className="text-[12px] font-medium uppercase tracking-wider text-[#71717A] dark:text-[#A1A1AA]">
            Live January 2026 Outturn Metrics (D-1 09:00 Cutoff)
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* 1. Overall MAE */}
            <div className="p-4 rounded-[12px] clean-card space-y-1">
              <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">Mean absolute error</div>
              {loadingSummary || !summary ? (
                <div className="h-8 w-24 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse my-1" />
              ) : (
                <div className="text-[28px] font-semibold tracking-tight tabular-nums text-[#18181B] dark:text-[#FAFAFA]">
                  {formatMW(summary.mae)}
                </div>
              )}
              <div className="text-[12px] text-[#71717A] dark:text-[#A1A1AA]">
                {summary ? `${summary.normalised_mae_pct}% normalised error` : "Calculating..."}
              </div>
            </div>

            {/* 2. Mean Bias */}
            <div className="p-4 rounded-[12px] clean-card space-y-1">
              <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">Directional bias</div>
              {loadingSummary || !summary ? (
                <div className="h-8 w-24 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse my-1" />
              ) : (
                <div className="text-[28px] font-semibold tracking-tight tabular-nums text-[#18181B] dark:text-[#FAFAFA]">
                  {summary.mean_bias > 0 ? "+" : ""}{Math.round(summary.mean_bias).toLocaleString()} MW
                </div>
              )}
              <div className="text-[12px] text-[#71717A] dark:text-[#A1A1AA]">
                {summary && summary.mean_bias > 0 ? "Over-prediction skew" : "Under-prediction skew"}
              </div>
            </div>

            {/* 3. Shortfall Rate */}
            <div className="p-4 rounded-[12px] clean-card space-y-1">
              <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">Shortfall frequency</div>
              {loadingSummary || !summary ? (
                <div className="h-8 w-24 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse my-1" />
              ) : (
                <div className="text-[28px] font-semibold tracking-tight tabular-nums text-[#18181B] dark:text-[#FAFAFA]">
                  {summary.shortfall_rate_pct.toFixed(1)}%
                </div>
              )}
              <div className="text-[12px] text-[#71717A] dark:text-[#A1A1AA]">
                Periods where forecast &gt; actual
              </div>
            </div>

            {/* 4. Suggested Buffer */}
            <div className="p-4 rounded-[12px] clean-card space-y-1">
              <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">Suggested buffer (P90)</div>
              {loadingSample || !sampleDecision ? (
                <div className="h-8 w-24 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse my-1" />
              ) : (
                <div className="text-[28px] font-semibold tracking-tight tabular-nums text-[#18181B] dark:text-[#FAFAFA]">
                  {formatMW(sampleDecision.buffer_mw)}
                </div>
              )}
              <div className="text-[12px] text-[#71717A] dark:text-[#A1A1AA]">
                90% empirical shortfall protection
              </div>
            </div>
          </div>
        </section>

        {/* Live Preview Chart Card */}
        <section className="p-6 rounded-[12px] clean-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                  Live forecast vs actual generation preview
                </h2>
                <span className="text-[12px] font-medium text-[#71717A] dark:text-[#A1A1AA] bg-[#F4F4F5] dark:bg-[#27272A] px-2 py-0.5 rounded">
                  Sample: 15 Jan 2026
                </span>
              </div>
              <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] mt-0.5">
                Target settlement half-hours under D-1 09:00 decision cutoff with reserve buffer derating.
              </p>
            </div>

            <div className="flex items-center gap-4 text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-[#2563EB] rounded-full" /> Forecast
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#F97316]" /> Actual outturn
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 bg-[#2563EB]/15 border border-[#2563EB]/30 rounded-sm" /> Buffer band
              </span>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            {loadingSample ? (
              <div className="h-full w-full rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={previewData} margin={CHART_MARGIN}>
                  <defs>
                    <linearGradient id="landingBufferArea" x1="0" y1="0" x2="0" y2="1">
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
                    interval={getXAxisInterval(previewData.length)}
                  />
                  <YAxis
                    stroke="#71717A"
                    fontSize={12}
                    width={Y_AXIS_WIDTH}
                    domain={previewDomain.domain}
                    ticks={previewDomain.ticks}
                    tickFormatter={formatTickNumber}
                  />
                  <Tooltip
                    content={<SharedTooltip unit="MW" />}
                    formatter={(val: any, name: any) => [
                      `${formatTickNumber(Number(val))} MW`,
                      name === "forecast"
                        ? "Forecast"
                        : name === "actual"
                        ? "Actual"
                        : "Derated floor",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="conservativeWind"
                    stroke="#2563EB"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    fill="url(#landingBufferArea)"
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
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="space-y-6 pt-4 scroll-mt-12">
          <div>
            <h2 className="text-2xl font-semibold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
              How it works
            </h2>
            <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] mt-1">
              Three-step quantitative workflow designed specifically for UK day-ahead power buyers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-[12px] clean-card space-y-2.5">
              <div className="w-7 h-7 rounded-full bg-[#EEF2FF] dark:bg-[#312E81]/40 text-[#4F46E5] dark:text-indigo-400 font-semibold text-[13px] flex items-center justify-center">
                1
              </div>
              <h3 className="text-base font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                Use available as-of forecast
              </h3>
              <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                Filter Elexon WINDFOR publication vintages to use strictly the latest forecast available at 09:00 on D-1, completely eliminating retrospective lookahead bias.
              </p>
            </div>

            <div className="p-5 rounded-[12px] clean-card space-y-2.5">
              <div className="w-7 h-7 rounded-full bg-[#EEF2FF] dark:bg-[#312E81]/40 text-[#4F46E5] dark:text-indigo-400 font-semibold text-[13px] flex items-center justify-center">
                2
              </div>
              <h3 className="text-base font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                Measure error vs actuals
              </h3>
              <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                Benchmark decision-time forecasts against metered Elexon FUELHH actual outturn across all 1,584 settlement periods in January 2026 to capture empirical error distributions.
              </p>
            </div>

            <div className="p-5 rounded-[12px] clean-card space-y-2.5">
              <div className="w-7 h-7 rounded-full bg-[#EEF2FF] dark:bg-[#312E81]/40 text-[#4F46E5] dark:text-indigo-400 font-semibold text-[13px] flex items-center justify-center">
                3
              </div>
              <h3 className="text-base font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                Size reserve buffer
              </h3>
              <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                Derive an empirical capacity reserve buffer directly from historical shortfalls to derate wind credit and calculate exact residual thermal procurement requirements.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* One-line footer: Source: Elexon BMRS (FUELHH, WINDFOR) · Decisions made in January 2026 */}
      <footer className="w-full border-t border-[#E4E4E7] dark:border-[#27272A] py-6 text-[13px] text-[#71717A] dark:text-[#A1A1AA] text-center">
        Source: Elexon BMRS (FUELHH, WINDFOR) · Decisions made in January 2026
      </footer>
    </div>
  )
}
