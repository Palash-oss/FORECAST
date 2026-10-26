import React, { useEffect, useState } from "react"

interface MetricCardProps {
  label: string
  value: number
  unit?: string
  decimals?: number
  subtitle?: string
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit = "MW",
  decimals = 0,
  subtitle,
}) => {
  const [displayValue, setDisplayValue] = useState(value)

  // Light number count-up transition
  useEffect(() => {
    let startTimestamp: number | null = null
    const duration = 150
    const startVal = displayValue
    const endVal = value

    if (startVal === endVal) return

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      const current = startVal + (endVal - startVal) * progress
      setDisplayValue(current)
      if (progress < 1) {
        window.requestAnimationFrame(step)
      }
    }
    window.requestAnimationFrame(step)
  }, [value])

  const formattedValue = displayValue.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <div className="p-5 clean-card transition-all duration-150">
      {/* 13px sentence case label */}
      <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] font-normal">
        {label}
      </div>

      {/* 30px semibold KPI number with tabular figures */}
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-[30px] font-semibold tracking-tight tabular-nums text-[#18181B] dark:text-[#FAFAFA] leading-none">
          {formattedValue}
        </span>
        {unit && (
          <span className="text-[14px] font-normal text-[#71717A] dark:text-[#A1A1AA]">
            {unit}
          </span>
        )}
      </div>

      {/* ONE short muted line */}
      {subtitle && (
        <div className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] font-normal mt-2">
          {subtitle}
        </div>
      )}
    </div>
  )
}
