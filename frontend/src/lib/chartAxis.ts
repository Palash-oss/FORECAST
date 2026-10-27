/**
 * Precision chart axis calculation and formatting utilities.
 * Implements "nice" numbers (1, 2, 2.5, 5 * 10^n), dynamic headroom,
 * thousands separator formatting, and responsive tick spacing.
 */

/**
 * Rounds a positive value with 10% headroom up to a "nice" step (1, 2, 2.5, 5 * 10^n).
 */
export function niceMax(value: number): number {
  if (value <= 0) return 0
  const target = value * 1.1
  const exponent = Math.floor(Math.log10(target))
  const fraction = target / Math.pow(10, exponent)

  let niceFraction: number
  if (fraction <= 1.0) {
    niceFraction = 1.0
  } else if (fraction <= 2.0) {
    niceFraction = 2.0
  } else if (fraction <= 2.5) {
    niceFraction = 2.5
  } else if (fraction <= 5.0) {
    niceFraction = 5.0
  } else {
    niceFraction = 10.0
  }

  return niceFraction * Math.pow(10, exponent)
}

/**
 * Rounds a negative value with 10% headroom down to a "nice" negative step.
 */
export function niceMin(value: number): number {
  if (value >= 0) return 0
  return -niceMax(Math.abs(value))
}

/**
 * Formats a number with thousands separators, single line, no units.
 * Example: 2600 -> "2,600", -1450.5 -> "-1,451"
 */
export function formatTickNumber(val: number): string {
  if (val === null || val === undefined || isNaN(val)) return "0"
  // Round to avoid floating point anomalies like 1000.0000000000001
  const rounded = Math.abs(val) < 1e-6 ? 0 : Math.round(val)
  return new Intl.NumberFormat("en-GB").format(rounded)
}

export interface AxisDomainResult {
  domain: [number, number]
  ticks: number[]
  niceMinVal: number
  niceMaxVal: number
}

/**
 * Computes a nice domain and evenly spaced ticks (~5 ticks) from a collection of series values.
 */
export function computeAxisDomain(
  values: (number | null | undefined)[],
  options: {
    includeZero?: boolean
    forceMinZero?: boolean
    targetTicks?: number
    defaultMax?: number
  } = {}
): AxisDomainResult {
  const {
    includeZero = false,
    forceMinZero = false,
    targetTicks = 5,
    defaultMax = 100,
  } = options

  const validValues = values.filter((v): v is number => v !== null && v !== undefined && !isNaN(v))

  if (validValues.length === 0) {
    const ticks = [0, 25, 50, 75, defaultMax]
    return {
      domain: [0, defaultMax],
      ticks,
      niceMinVal: 0,
      niceMaxVal: defaultMax,
    }
  }

  let rawMin = Math.min(...validValues)
  let rawMax = Math.max(...validValues)

  if (includeZero) {
    if (rawMin > 0) rawMin = 0
    if (rawMax < 0) rawMax = 0
  }

  if (forceMinZero) {
    rawMin = 0
  }

  // Handle single data point or flat line
  if (rawMin === rawMax) {
    if (rawMax === 0) {
      rawMax = defaultMax
    } else if (rawMax > 0) {
      rawMin = 0
      rawMax = rawMax * 1.2
    } else {
      rawMin = rawMin * 1.2
      rawMax = 0
    }
  }

  let finalMin = rawMin < 0 ? niceMin(rawMin) : 0
  let finalMax = rawMax > 0 ? niceMax(rawMax) : 0

  if (rawMin >= 0 && !forceMinZero && !includeZero) {
    // If all positive and zero not required, start from nice rounded min
    finalMin = Math.max(0, Math.floor(rawMin * 0.9))
  }

  const range = finalMax - finalMin
  if (range <= 0) {
    return {
      domain: [0, defaultMax],
      ticks: [0, defaultMax / 2, defaultMax],
      niceMinVal: 0,
      niceMaxVal: defaultMax,
    }
  }

  // Determine nice step size
  const rawStep = range / (targetTicks - 1)
  const stepExponent = Math.floor(Math.log10(rawStep))
  const stepFraction = rawStep / Math.pow(10, stepExponent)

  let niceStepFraction: number
  if (stepFraction <= 1.0) {
    niceStepFraction = 1.0
  } else if (stepFraction <= 2.0) {
    niceStepFraction = 2.0
  } else if (stepFraction <= 2.5) {
    niceStepFraction = 2.5
  } else if (stepFraction <= 5.0) {
    niceStepFraction = 5.0
  } else {
    niceStepFraction = 10.0
  }

  const step = niceStepFraction * Math.pow(10, stepExponent)

  // Re-align min and max to multiples of step
  const alignedMin = Math.floor(finalMin / step) * step
  const alignedMax = Math.ceil(finalMax / step) * step

  const ticks: number[] = []
  for (let t = alignedMin; t <= alignedMax + step * 0.01; t += step) {
    // Fix IEEE 754 precision issues
    const cleanTick = Math.round(t * 1e6) / 1e6
    ticks.push(cleanTick)
  }

  return {
    domain: [alignedMin, alignedMax],
    ticks,
    niceMinVal: alignedMin,
    niceMaxVal: alignedMax,
  }
}

/**
 * Calculates a clean XAxis interval for categorical/time series to prevent label overlap.
 */
export function getXAxisInterval(totalPoints: number, isNarrowScreen = false): number {
  if (totalPoints <= 8) return 0
  if (isNarrowScreen) {
    if (totalPoints <= 24) return 3 // every 4th
    if (totalPoints <= 48) return 7 // every 8th
    return Math.ceil(totalPoints / 6)
  }
  if (totalPoints <= 24) return 1 // every 2nd
  if (totalPoints <= 48) return 3 // every 4th (e.g. every 2 hours in 48-period day)
  if (totalPoints <= 100) return 7
  return Math.ceil(totalPoints / 10)
}
