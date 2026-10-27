import React, { useState, useRef, useEffect } from "react"
import { NavLink, Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Moon, Sun, Settings, X, Menu, Home } from "lucide-react"
import { api } from "../../api/client"

interface NavbarProps {
  cutoffTime: string
  setCutoffTime: (val: string) => void
  confidenceLevel: number
  setConfidenceLevel: (val: number) => void
  isDark: boolean
  setIsDark: (val: boolean) => void
}

export const Navbar: React.FC<NavbarProps> = ({
  cutoffTime,
  setCutoffTime,
  confidenceLevel,
  setConfidenceLevel,
  isDark,
  setIsDark,
}) => {
  const [showSettings, setShowSettings] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const tabs = [
    { to: "/dashboard", label: "Overview", end: true, type: "decision" },
    { to: "/dashboard/accuracy", label: "Accuracy", end: false, type: "accuracy" },
    { to: "/dashboard/lead-time", label: "Lead time", end: false, type: "horizon" },
    { to: "/dashboard/time-of-day", label: "Time of day", end: false, type: "time-of-day" },
  ]

  const cutoffOptions = [
    { value: "06:00", label: "06:00 (Early morning)" },
    { value: "09:00", label: "09:00 (Default D-1 DA)" },
    { value: "11:00", label: "11:00 (Pre-auction)" },
    { value: "14:00", label: "14:00 (Post-auction)" },
  ]

  const confidenceOptions = [
    { value: 0.80, label: "P80 (Aggressive)" },
    { value: 0.90, label: "P90 (Standard default)" },
    { value: 0.95, label: "P95 (Conservative)" },
    { value: 0.99, label: "P99 (High security)" },
  ]

  // Hover prefetching for instant tab transitions
  const handlePrefetch = (type: string) => {
    if (type === "accuracy") {
      queryClient.prefetchQuery({
        queryKey: ["accuracySummary", cutoffTime],
        queryFn: () => api.getAccuracySummary(cutoffTime),
      })
      queryClient.prefetchQuery({
        queryKey: ["accuracyDaily", cutoffTime],
        queryFn: () => api.getAccuracyDaily(cutoffTime),
      })
      queryClient.prefetchQuery({
        queryKey: ["accuracyDistribution", cutoffTime],
        queryFn: () => api.getAccuracyDistribution(cutoffTime, 30),
      })
    } else if (type === "horizon") {
      queryClient.prefetchQuery({
        queryKey: ["accuracyHorizon", 0, 48],
        queryFn: () => api.getAccuracyByHorizon(0, 48),
      })
    } else if (type === "time-of-day") {
      queryClient.prefetchQuery({
        queryKey: ["accuracyByHour", cutoffTime],
        queryFn: () => api.getAccuracyByHour(cutoffTime),
      })
    } else if (type === "decision") {
      queryClient.prefetchQuery({
        queryKey: ["decision", "2026-01-15", cutoffTime, confidenceLevel],
        queryFn: () => api.getDecision("2026-01-15", cutoffTime, confidenceLevel, 25000),
      })
    }
  }

  // Close settings on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false)
      }
    }
    if (showSettings) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showSettings])

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#09090B]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left: Product Name + Home link + Tab Navigation */}
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="flex items-center gap-2 text-left focus:outline-none group"
              title="Return to Home"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#4F46E5] group-hover:scale-110 transition-transform" />
              <span className="text-[15px] font-semibold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
                Wind Forecast Desk
              </span>
            </Link>

            {/* Home link */}
            <Link
              to="/"
              className="hidden lg:inline-flex items-center gap-1.5 text-[13px] text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </Link>

            {/* Centre/Left: Tab Links with active indicator */}
            <nav className="hidden md:flex items-center gap-6 h-14 pt-4">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  onMouseEnter={() => handlePrefetch(tab.type)}
                  className={({ isActive }) =>
                    `text-[14px] pb-4 -mb-[1px] border-b-2 transition-colors duration-150 ${
                      isActive
                        ? "text-[#18181B] dark:text-[#FAFAFA] font-medium border-[#4F46E5]"
                        : "text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] border-transparent"
                    }`
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Right: Settings Popover + Theme Toggle */}
          <div className="flex items-center gap-2">
            {/* Settings Button & Popover */}
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-normal transition-colors duration-150 ${
                  showSettings
                    ? "bg-[#F4F4F5] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA]"
                    : "text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]"
                }`}
                title="Trading parameter settings"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </button>

              {showSettings && (
                <div className="absolute right-0 mt-2 w-72 p-4 rounded-xl clean-card bg-white dark:bg-[#18181B] shadow-[0_4px_16px_rgba(0,0,0,0.10)] z-50 text-[13px] space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#E4E4E7] dark:border-[#27272A]">
                    <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">Trading settings</span>
                    <button
                      onClick={() => setShowSettings(false)}
                      className="text-[#71717A] hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Cutoff Setting */}
                  <div className="space-y-1.5">
                    <label htmlFor="settings-cutoff" className="text-[#71717A] dark:text-[#A1A1AA] block text-[13px]">
                      Forecast cutoff (UK time on D-1)
                    </label>
                    <select
                      id="settings-cutoff"
                      value={cutoffTime}
                      onChange={(e) => setCutoffTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A] bg-transparent text-[#18181B] dark:text-[#FAFAFA] text-[13px] focus:ring-2 focus:ring-[#4F46E5] focus:outline-none"
                    >
                      {cutoffOptions.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-white dark:bg-[#18181B]">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Confidence Level Setting */}
                  <div className="space-y-1.5">
                    <label htmlFor="settings-confidence" className="text-[#71717A] dark:text-[#A1A1AA] block text-[13px]">
                      Buffer confidence
                    </label>
                    <select
                      id="settings-confidence"
                      value={confidenceLevel}
                      onChange={(e) => setConfidenceLevel(parseFloat(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-[#27272A] bg-transparent text-[#18181B] dark:text-[#FAFAFA] text-[13px] focus:ring-2 focus:ring-[#4F46E5] focus:outline-none"
                    >
                      {confidenceOptions.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-white dark:bg-[#18181B]">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-1.5 rounded-lg text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition-colors duration-150"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] md:hidden"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Nav */}
        {mobileMenuOpen && (
          <nav className="flex flex-col py-2 border-t border-[#E4E4E7] dark:border-[#27272A] md:hidden space-y-1">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 py-2 px-3 text-[14px] text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] rounded-lg transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </Link>
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `text-left py-2 px-3 text-[14px] rounded-lg transition-colors ${
                    isActive
                      ? "text-[#4F46E5] font-medium bg-[#EEF2FF] dark:bg-[#312E81]/30"
                      : "text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </header>
  )
}
