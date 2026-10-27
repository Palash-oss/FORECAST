import React, { Suspense, useEffect, useState, useTransition } from "react"
import { Outlet, useSearchParams, useOutletContext } from "react-router-dom"
import { Navbar } from "../common/Navbar"

export interface DashboardContextType {
  cutoffTime: string
  setCutoffTime: (val: string) => void
  confidenceLevel: number
  setConfidenceLevel: (val: number) => void
  deliveryDate: string
  setDeliveryDate: (val: string) => void
  minHorizon: number
  setMinHorizon: (val: number) => void
  maxHorizon: number
  setMaxHorizon: (val: number) => void
}

export function useDashboardContext() {
  return useOutletContext<DashboardContextType>()
}

interface DashboardLayoutProps {
  isDark: boolean
  toggleTheme: (val: boolean) => void
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ isDark, toggleTheme }) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [, startTransition] = useTransition()

  // State initialized from URL query params
  const [cutoffTime, setCutoffTimeState] = useState<string>(() => searchParams.get("cutoff") || "09:00")
  const [confidenceLevel, setConfidenceLevelState] = useState<number>(() =>
    parseFloat(searchParams.get("confidence") || "0.90")
  )
  const [deliveryDate, setDeliveryDateState] = useState<string>(() => searchParams.get("date") || "2026-01-15")
  const [minHorizon, setMinHorizonState] = useState<number>(() =>
    parseFloat(searchParams.get("minHorizon") || "0")
  )
  const [maxHorizon, setMaxHorizonState] = useState<number>(() =>
    parseFloat(searchParams.get("maxHorizon") || "48")
  )

  // Debounced URL synchronization (250ms debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.set("cutoff", cutoffTime)
          next.set("confidence", String(confidenceLevel))
          next.set("date", deliveryDate)
          next.set("minHorizon", String(minHorizon))
          next.set("maxHorizon", String(maxHorizon))
          return next
        }, { replace: true })
      })
    }, 250)

    return () => clearTimeout(timer)
  }, [cutoffTime, confidenceLevel, deliveryDate, minHorizon, maxHorizon, setSearchParams])

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] text-[#18181B] dark:text-[#FAFAFA] flex flex-col font-sans transition-colors duration-150">
      {/* Slim Header Navigation */}
      <Navbar
        cutoffTime={cutoffTime}
        setCutoffTime={setCutoffTimeState}
        confidenceLevel={confidenceLevel}
        setConfidenceLevel={setConfidenceLevelState}
        isDark={isDark}
        setIsDark={toggleTheme}
      />

      {/* Main Content Area (Max ~1200px Centred) */}
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-6 min-w-0">
        <Suspense
          fallback={
            <div className="space-y-6">
              <div className="h-10 w-72 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-28 rounded-[12px] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                ))}
              </div>
              <div className="h-[320px] rounded-[12px] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            </div>
          }
        >
          {/* Subtle 150ms fade on route transition */}
          <div className="animate-fade-in transition-opacity duration-150">
            <Outlet
              context={{
                cutoffTime,
                setCutoffTime: setCutoffTimeState,
                confidenceLevel,
                setConfidenceLevel: setConfidenceLevelState,
                deliveryDate,
                setDeliveryDate: setDeliveryDateState,
                minHorizon,
                setMinHorizon: setMinHorizonState,
                maxHorizon,
                setMaxHorizon: setMaxHorizonState,
              }}
            />
          </div>
        </Suspense>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full border-t border-[#E4E4E7] dark:border-[#27272A] py-5 mt-12 text-[13px] text-[#71717A] dark:text-[#A1A1AA]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Wind Forecast Desk • Elexon BMRS day-ahead forecast & actual generation
          </div>
          <div>
            January 2026 outturn evaluation (1,584 settlement periods)
          </div>
        </div>
      </footer>
    </div>
  )
}
