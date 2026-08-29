import { useState, useId } from "react"
import { formatMinor } from "@/lib/currency"

export type Slice = {
  label: string
  value: number
  color: string
  emoji?: string
  percentage?: number
  id?: string
}

export interface DonutProps {
  data: Slice[]
  currency?: string
  size?: number
  stroke?: number
  activeCategory?: string | null
  onHoverCategory?: (label: string | null) => void
  ariaLabel?: string
}

/**
 * Interactive SVG Donut Chart with animated stroke transitions,
 * hover arc scaling, center readout, and bidirectional category synchronization.
 * Zero 3rd-party charting bloat — pure theme-aware SVG + Tailwind CSS.
 */
export function Donut({
  data,
  currency = "INR",
  size = 140,
  stroke = 18,
  activeCategory,
  onHoverCategory,
  ariaLabel = "Category spending distribution",
}: DonutProps) {
  const [internalActive, setInternalActive] = useState<number | null>(null)
  const filterId = useId().replace(/:/g, "_")

  const total = data.reduce((s, d) => s + (d.value || 0), 0)
  const r = Math.max((size - stroke - 4) / 2, 10)
  const c = 2 * Math.PI * r
  const gap = total > 0 && data.filter((d) => d.value > 0).length > 1 ? 2.5 : 0

  // Resolve external or internal active segment
  const activeIndex =
    activeCategory !== undefined
      ? activeCategory === null
        ? null
        : data.findIndex((d) => d.label.toLowerCase() === activeCategory.toLowerCase())
      : internalActive

  const handleSetActive = (index: number | null) => {
    setInternalActive(index)
    if (onHoverCategory) {
      onHoverCategory(index === null ? null : data[index]?.label ?? null)
    }
  }

  let offset = 0
  const arcs = data.map((d, i) => {
    const frac = total > 0 ? Math.max(d.value, 0) / total : 0
    const arcLen = total > 0 ? Math.max(frac * c - gap, 0) : 0
    const arc = {
      d,
      i,
      frac,
      dash: `${arcLen} ${Math.max(c - arcLen, 0)}`,
      dashoffset: -offset,
    }
    offset += frac * c
    return arc
  })

  const shown =
    activeIndex !== null && activeIndex >= 0 && activeIndex < data.length
      ? data[activeIndex]
      : null
  const shownPct = shown && total > 0 ? Math.round((shown.value / total) * 100) : 0

  return (
    <div
      className="relative shrink-0 flex items-center justify-center select-none"
      style={{ width: size, height: size }}
      role="region"
      aria-label={ariaLabel}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 transform-gpu overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <filter id={`glow-${filterId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-hair)"
          strokeWidth={stroke}
          className="opacity-40 dark:opacity-30 transition-colors"
        />

        {/* Dynamic arc segments */}
        {total > 0 &&
          arcs.map((a) => {
            const isCurrentActive = activeIndex === a.i
            const hasAnyActive = activeIndex !== null && activeIndex >= 0
            const currentStroke = isCurrentActive ? stroke + 3.5 : stroke
            const currentOpacity = isCurrentActive ? 1 : hasAnyActive ? 0.32 : 1

            return (
              <circle
                key={a.d.id ?? a.i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={a.d.color}
                strokeWidth={currentStroke}
                strokeDasharray={a.dash}
                strokeDashoffset={a.dashoffset}
                strokeLinecap="butt"
                onMouseEnter={() => handleSetActive(a.i)}
                onMouseLeave={() => handleSetActive(null)}
                onFocus={() => handleSetActive(a.i)}
                onBlur={() => handleSetActive(null)}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${a.d.label}: ${formatMinor(a.d.value, currency)} (${Math.round(a.frac * 100)}%)`}
                filter={isCurrentActive ? `url(#glow-${filterId})` : undefined}
                style={{
                  cursor: "pointer",
                  opacity: currentOpacity,
                  transition:
                    "stroke-width 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease, filter 0.2s ease",
                  outline: "none",
                }}
              />
            )
          })}
      </svg>

      {/* Center Readout */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-2"
        aria-live="polite"
      >
        <span
          className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-150 truncate max-w-[85%] ${
            shown ? "text-brand" : "text-ink-faint"
          }`}
        >
          {shown ? shown.label : "Total"}
        </span>
        <span className="tnum font-mono text-base sm:text-lg font-bold text-ink leading-tight tracking-tight mt-0.5">
          {formatMinor(shown ? shown.value : total, currency)}
        </span>
        {shown ? (
          <span className="text-[10px] tnum font-semibold text-brand mt-0.5 flex items-center gap-0.5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: shown.color }}
            />
            {shownPct}%
          </span>
        ) : (
          <span className="text-[10px] tnum font-medium text-ink-faint mt-0.5">
            {data.filter((d) => d.value > 0).length}{" "}
            {data.filter((d) => d.value > 0).length === 1 ? "cat" : "cats"}
          </span>
        )}
      </div>
    </div>
  )
}

export interface DailyBarItem {
  label: string
  value?: number
  amountMinor?: number
  date?: string
  isPeak?: boolean
}

export interface DailyBarsProps {
  data?: DailyBarItem[]
  days?: DailyBarItem[]
  avgMinor?: number
  currency?: string
  height?: number
  ariaLabel?: string
}

/**
 * Interactive SVG/HTML Daily Spending Trajectory Bars.
 * Features relative percentage heights, peak-day glowing badges,
 * average daily spend dashed reference line, and spring hover tooltip popovers.
 */
export function DailyBars({
  data,
  days,
  avgMinor,
  currency = "INR",
  height = 104,
  ariaLabel = "Daily spending trajectory chart",
}: DailyBarsProps) {
  const [active, setActive] = useState<number | null>(null)

  // Standardize input list
  const rawItems = data ?? days ?? []
  const items = rawItems.map((item) => ({
    label: item.label,
    value: item.value ?? item.amountMinor ?? 0,
    date: item.date,
    isPeak: item.isPeak,
  }))

  const max = Math.max(...items.map((d) => d.value), 1)
  const total = items.reduce((s, d) => s + d.value, 0)
  const computedAvg =
    avgMinor !== undefined
      ? avgMinor
      : items.length > 0
      ? Math.round(total / items.length)
      : 0

  // Reference line relative vertical position (bounded between 8% and 92%)
  const avgHeightPct =
    max > 0 && computedAvg > 0
      ? Math.min(Math.max((computedAvg / max) * 100, 8), 92)
      : null

  return (
    <div
      className="relative w-full px-1 pt-6 select-none"
      role="region"
      aria-label={ariaLabel}
    >
      {/* Average Daily Spend Dashed Reference Line */}
      {avgHeightPct !== null && items.length > 1 && (
        <div
          className="absolute inset-x-2 border-t border-dashed border-brand/35 dark:border-brand/45 pointer-events-none z-0 flex items-center justify-end"
          style={{ bottom: `calc(${avgHeightPct}% * 0.72 + 28px)` }}
        >
          <span className="bg-surface/90 text-brand px-1 py-0.2 text-[9px] font-mono font-bold tracking-tight rounded -mt-2.5 shadow-2xs border border-brand/20">
            avg {formatMinor(computedAvg, currency)}
          </span>
        </div>
      )}

      {/* Bar Columns Container */}
      <div
        className="relative flex items-end justify-between gap-1.5 sm:gap-2.5 z-10"
        style={{ height: `${height}px` }}
      >
        {items.map((d, i) => {
          const isItemPeak = d.isPeak ?? (d.value === max && max > 0 && items.length > 1)
          const h = max > 0 ? Math.max((d.value / max) * 100, d.value > 0 ? 8 : 4) : 4
          const isActive = active === i
          const hasActive = active !== null

          return (
            <div
              key={i}
              className="relative grow flex flex-col items-center justify-end h-full group outline-none"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              role="button"
              aria-label={`Day ${d.label}: ${formatMinor(d.value, currency)}${isItemPeak ? " (Peak Day)" : ""}`}
            >
              {/* Tooltip Popover */}
              {isActive && (
                <div className="absolute -top-10 z-30 whitespace-nowrap rounded-lg border border-slate-700/60 bg-slate-900/95 px-2.5 py-1 text-[11px] font-medium text-white shadow-xl dark:border-slate-700 dark:bg-slate-800/95 dark:text-slate-100 animate-badge-pop backdrop-blur-xs flex flex-col items-center pointer-events-none">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-300">{d.label}</span>
                    <span className="tnum font-mono font-bold text-emerald-400">
                      {formatMinor(d.value, currency)}
                    </span>
                  </div>
                  {isItemPeak && (
                    <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wide">
                      👑 Peak Day
                    </span>
                  )}
                  {/* Tooltip Arrow */}
                  <div className="w-1.5 h-1.5 bg-slate-900 dark:bg-slate-800 border-r border-b border-slate-700/60 rotate-45 -mb-1 mt-0.5" />
                </div>
              )}

              {/* Peak Marker Badge */}
              {isItemPeak && !isActive && (
                <div className="absolute -top-4 text-[9px] font-extrabold text-amber-500 dark:text-amber-400 animate-pulse pointer-events-none">
                  👑
                </div>
              )}

              {/* Bar track and fill */}
              <div className="w-full flex items-end justify-center h-[72px] pb-1">
                <div
                  className={`w-full max-w-[28px] rounded-[5px_5px_1px_1px] transition-all duration-200 ${
                    isItemPeak
                      ? isActive
                        ? "bg-gradient-to-t from-brand to-amber-500 shadow-glow-brand scale-y-105"
                        : "bg-gradient-to-t from-brand to-blue-400 dark:from-brand dark:to-blue-300 shadow-sm"
                      : isActive
                      ? "bg-brand shadow-glow-brand scale-y-105"
                      : hasActive
                      ? "bg-blue-200 dark:bg-slate-700 opacity-40"
                      : "bg-blue-200/85 hover:bg-blue-300/90 dark:bg-slate-700 dark:hover:bg-slate-600"
                  }`}
                  style={{
                    height: `${h}%`,
                    transformOrigin: "bottom",
                  }}
                />
              </div>

              {/* Day Label */}
              <span
                className={`text-[10px] font-semibold transition-colors mt-1 ${
                  isActive
                    ? "text-brand font-bold"
                    : isItemPeak
                    ? "text-ink font-bold"
                    : "text-ink-faint"
                }`}
              >
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
