import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMW(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—"
  return `${Math.round(val).toLocaleString()} MW`
}

export function formatMWPrecise(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || isNaN(val)) return "—"
  return `${val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} MW`
}

export function formatMWh(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—"
  return `${Math.round(val).toLocaleString()} MWh`
}

export function formatPercent(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || isNaN(val)) return "—"
  return `${val.toFixed(decimals)}%`
}

export function formatLeadTime(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || isNaN(hours)) return "—"
  return `${hours.toFixed(1)}h`
}

export function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00Z")
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
  } catch {
    return dateStr
  }
}
