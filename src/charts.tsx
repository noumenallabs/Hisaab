import { useState } from "react"
import { formatMinor } from "@/lib/currency"

export type Slice = { label: string; value: number; color: string }

/** Compact donut with a live center readout. Hovering a segment highlights it
 *  and swaps the center label — segments are separated by a 2px surface gap and
 *  each is directly labeled in the accompanying legend (secondary encoding). */
export function Donut({
  data,
  currency = "INR",
  size = 132,
  stroke = 18,
}: {
  data: Slice[]
  currency?: string
  size?: number
  stroke?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const gap = 2 // px surface gap between segments

  let offset = 0
  const arcs = data.map((d, i) => {
    const frac = d.value / total
    const len = Math.max(frac * c - gap, 0)
    const arc = {
      d,
      i,
      dash: `${len} ${c - len}`,
      dashoffset: -offset,
    }
    offset += frac * c
    return arc
  })

  const shown = active === null ? null : data[active]

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-hair)"
          strokeWidth={stroke}
        />
        {arcs.map((a) => (
          <circle
            key={a.i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={a.d.color}
            strokeWidth={stroke}
            strokeDasharray={a.dash}
            strokeDashoffset={a.dashoffset}
            strokeLinecap="butt"
            onMouseEnter={() => setActive(a.i)}
            onMouseLeave={() => setActive(null)}
            style={{
              cursor: "pointer",
              opacity: active === null || active === a.i ? 1 : 0.32,
              transition: "opacity .18s ease",
            }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center pointer-events-none">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          {shown ? shown.label : "Total"}
        </span>
        <span className="tnum font-mono text-lg font-bold text-ink leading-tight">
          {formatMinor(shown ? shown.value : total, currency)}
        </span>
        {shown && (
          <span className="text-[10px] tnum text-ink-faint">
            {Math.round((shown.value / total) * 100)}%
          </span>
        )}
      </div>
    </div>
  )
}

/** Small daily-spend bars with per-bar hover tooltip. */
export function DailyBars({
  data,
  currency = "INR",
}: {
  data: { label: string; value: number }[]
  currency?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex items-end gap-2 h-24 px-1">
      {data.map((d, i) => {
        const h = Math.max((d.value / max) * 100, 4)
        const on = active === i
        return (
          <div
            key={i}
            className="relative grow flex flex-col items-center gap-1.5"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            {on && (
              <div className="absolute -top-8 z-10 whitespace-nowrap rounded-md border border-slate-700/60 bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 tnum">
                {formatMinor(d.value, currency)}
              </div>
            )}
            <div className="w-full flex items-end justify-center h-[72px]">
              <div
                className="w-full max-w-[26px] rounded-[4px_4px_0_0] transition-all"
                style={{
                  height: `${h}%`,
                  background: on ? "var(--color-brand)" : "#c9d8f5",
                }}
              />
            </div>
            <span className="text-[10px] text-ink-faint font-medium">
              {d.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
