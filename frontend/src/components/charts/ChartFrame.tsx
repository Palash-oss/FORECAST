import React from "react"
import { ResponsiveContainer } from "recharts"
import { formatTickNumber } from "../../lib/chartAxis"

export interface ChartFrameProps {
  title: string
  subtitle?: string
  unit: string // e.g. "MW" or "%"
  takeaway?: string
  legend?: React.ReactNode
  headerRight?: React.ReactNode
  height?: number // Default is 320px
  children: React.ReactNode
  className?: string
}

export const CHART_MARGIN = { top: 24, right: 24, left: 8, bottom: 8 }
export const Y_AXIS_WIDTH = 64

export interface CustomTooltipItem {
  name: string
  value: number | string | null | undefined
  color?: string
  unit?: string
}

export interface SharedTooltipContentProps {
  active?: boolean
  payload?: any[]
  label?: string | number
  unit?: string
  formatter?: (val: any, name: any, item: any) => [string, string]
}

export const SharedTooltip: React.FC<SharedTooltipContentProps> = ({
  active,
  payload,
  label,
  unit = "MW",
  formatter,
}) => {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-lg border border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#18181B] p-2.5 shadow-[0_4px_12px_rgba(0,0,0,0.06)] text-[13px] text-[#18181B] dark:text-[#FAFAFA] min-w-[140px] pointer-events-none z-50">
      {label !== undefined && label !== null && (
        <div className="font-medium text-[#71717A] dark:text-[#A1A1AA] pb-1.5 mb-1.5 border-b border-[#E4E4E7] dark:border-[#27272A]">
          {label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, index) => {
          let displayVal = ""
          let displayName = entry.name || entry.dataKey

          if (formatter) {
            const formatted = formatter(entry.value, entry.name, entry)
            displayVal = formatted[0]
            displayName = formatted[1] || displayName
          } else {
            const num = Number(entry.value)
            displayVal = !isNaN(num)
              ? `${formatTickNumber(num)} ${unit}`
              : String(entry.value)
          }

          return (
            <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="flex items-center gap-1.5 text-[#71717A] dark:text-[#A1A1AA]">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color || entry.fill || "#2563EB" }}
                />
                <span className="truncate max-w-[130px]">{displayName}</span>
              </span>
              <span className="font-semibold tabular-nums text-[#18181B] dark:text-[#FAFAFA]">
                {displayVal}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const ChartFrame: React.FC<ChartFrameProps> = ({
  title,
  subtitle,
  unit,
  takeaway,
  legend,
  headerRight,
  height = 320,
  children,
  className = "",
}) => {
  return (
    <div className={`p-6 rounded-[12px] clean-card space-y-4 min-w-0 ${className}`}>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#18181B] dark:text-[#FAFAFA] truncate">
              {title}
            </h2>
            <span className="text-[12px] font-medium text-[#71717A] dark:text-[#A1A1AA] bg-[#F4F4F5] dark:bg-[#27272A] px-2 py-0.5 rounded">
              Unit: {unit}
            </span>
          </div>
          {subtitle && (
            <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {legend}
          {headerRight}
        </div>
      </div>

      {/* Chart container with fixed height and visible overflow */}
      <div
        className="w-full relative overflow-visible min-w-0"
        style={{ height: `${height}px` }}
      >
        <ResponsiveContainer width="100%" height={height}>
          {children as any}
        </ResponsiveContainer>
      </div>

      {/* Numerical takeaway */}
      {takeaway && (
        <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] pt-1 border-t border-[#E4E4E7]/60 dark:border-[#27272A]/60 leading-relaxed">
          <span className="font-medium text-[#18181B] dark:text-[#FAFAFA]">Takeaway: </span>
          {takeaway}
        </p>
      )}
    </div>
  )
}
