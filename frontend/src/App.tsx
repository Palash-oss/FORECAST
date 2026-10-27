import React, { Suspense, useEffect, useState } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider, keepPreviousData } from "@tanstack/react-query"
import { DashboardLayout } from "./components/layout/DashboardLayout"

// Route-level code splitting with React.lazy
const LandingPage = React.lazy(() =>
  import("./pages/LandingPage").then((m) => ({ default: m.LandingPage }))
)
const DecisionPage = React.lazy(() =>
  import("./pages/DecisionPage").then((m) => ({ default: m.DecisionPage }))
)
const AccuracyPage = React.lazy(() =>
  import("./pages/AccuracyPage").then((m) => ({ default: m.AccuracyPage }))
)
const HorizonPage = React.lazy(() =>
  import("./pages/HorizonPage").then((m) => ({ default: m.HorizonPage }))
)
const TimeOfDayCoveragePage = React.lazy(() =>
  import("./pages/TimeOfDayCoveragePage").then((m) => ({ default: m.TimeOfDayCoveragePage }))
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      placeholderData: keepPreviousData, // never blank out during controls change
    },
  },
})

export const AppContent: React.FC = () => {
  // Light theme is default
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem("wind_theme")
    return saved === "dark"
  })

  const toggleTheme = (val: boolean) => {
    setIsDark(val)
    localStorage.setItem("wind_theme", val ? "dark" : "light")
  }

  // Handle dark mode class on root document
  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
  }, [isDark])

  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-[#4F46E5] border-t-transparent animate-spin" />
          </div>
        }
      >
        <Routes>
          {/* Landing hero page at / */}
          <Route path="/" element={<LandingPage isDark={isDark} toggleTheme={toggleTheme} />} />

          {/* Dashboard shell routes under /dashboard */}
          <Route path="/dashboard" element={<DashboardLayout isDark={isDark} toggleTheme={toggleTheme} />}>
            <Route index element={<DecisionPage />} />
            <Route path="accuracy" element={<AccuracyPage />} />
            <Route path="lead-time" element={<HorizonPage />} />
            <Route path="time-of-day" element={<TimeOfDayCoveragePage />} />
          </Route>

          {/* Catch-all redirect to hero landing page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}
