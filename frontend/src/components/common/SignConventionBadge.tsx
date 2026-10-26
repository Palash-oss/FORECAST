import React, { useState, useRef, useEffect } from "react"
import { HelpCircle, X } from "lucide-react"

export const SignConventionBadge: React.FC = () => {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleOutside)
    }
  }, [open])

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-[13px] text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition-colors duration-150"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        <span>How to read forecast errors</span>
      </button>

      {open && (
        <div className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-80 p-4 rounded-xl clean-card bg-white dark:bg-[#18181B] shadow-popover z-50 text-[13px] space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-[#E4E4E7] dark:border-[#27272A]">
            <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">Sign convention</span>
            <button onClick={() => setOpen(false)} className="text-[#71717A] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1.5 text-[#18181B] dark:text-[#FAFAFA]">
            <div className="font-medium text-[#4F46E5] dark:text-indigo-400">
              Error = Forecast − Actual
            </div>
            <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
              <strong className="text-[#DC2626] font-medium">Positive (+ MW) = Over-forecast (Shortfall risk).</strong> Wind outturn was lower than predicted. The desk must buy thermal power to fill the gap.
            </p>
            <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
              <strong className="text-[#18181B] dark:text-[#FAFAFA] font-medium">Negative (− MW) = Under-forecast (Surplus).</strong> Wind outturn exceeded forecast, with no prompt shortfall penalty.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
