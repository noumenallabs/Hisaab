import { useState } from "react"
import { formatMinor } from "@/lib/currency"
import { UserAvatar } from "@/components/feedback/UserAvatar"
import { Calendar, ChevronDown, CheckCircle2, ArrowRight, Sparkles } from "lucide-react"
import { DayTimelineItem } from "./dayMath"

interface DailyBreakdownProps {
  timeline: DayTimelineItem[]
  currency: string
  memberMap: Map<string, string>
  currentUserId?: string
  onSettle: (transfer: {
    fromId: string
    toId: string
    amount: number
    dayLabel?: string
  }) => void
}

export function DailyBreakdown({
  timeline,
  currency,
  memberMap,
  currentUserId,
  onSettle,
}: DailyBreakdownProps) {
  // Keep first 2 days expanded by default
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    timeline.forEach((item, idx) => {
      initial[item.date] = idx < 2
    })
    return initial
  })

  function toggleExpand(dateStr: string) {
    setExpandedDates((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }))
  }

  if (timeline.length === 0) {
    return (
      <div className="rounded-2xl border border-hair bg-surface p-8 text-center text-sm text-ink-soft">
        <Calendar className="mx-auto mb-2 text-ink-faint" size={24} />
        No daily expense data available yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold tracking-tight text-ink flex items-center gap-2">
            <Calendar size={18} className="text-brand" />
            Day-Wise Settlement Timeline
          </h2>
          <p className="text-xs text-ink-soft">
            Daily expenses and isolated debt settlements for each day of the journey
          </p>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              const all: Record<string, boolean> = {}
              timeline.forEach((item) => (all[item.date] = true))
              setExpandedDates(all)
            }}
            className="text-brand hover:underline active:scale-[0.98] transition-transform cursor-pointer"
          >
            Expand all
          </button>
          <span className="text-hair">·</span>
          <button
            type="button"
            onClick={() => setExpandedDates({})}
            className="text-ink-faint hover:underline active:scale-[0.98] transition-transform cursor-pointer"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {timeline.map((day) => {
          const isExpanded = !!expandedDates[day.date]
          const payerEntries = Object.entries(day.payerMap).filter(([, amt]) => amt > 0)
          const contentId = `day-content-${day.date}`
          const headerId = `day-header-${day.date}`

          return (
            <div
              key={day.date}
              className="overflow-hidden rounded-2xl border border-hair bg-surface shadow-2xs transition-all hover:border-hair/80"
            >
              {/* Day Header Accordion Trigger */}
              <button
                type="button"
                id={headerId}
                onClick={() => toggleExpand(day.date)}
                className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-canvas/50 cursor-pointer"
                aria-expanded={isExpanded}
                aria-controls={contentId}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 font-bold text-sm text-brand border border-brand/20">
                    D{day.dayNumber}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-ink">{day.label}</h3>
                      {day.isSettled ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={11} /> Balanced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          <Sparkles size={11} /> {day.transfers.length} {day.transfers.length === 1 ? "settlement" : "settlements"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-soft mt-0.5">
                      {day.expenseCount} {day.expenseCount === 1 ? "expense" : "expenses"} · Total {formatMinor(day.totalMinor, currency)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-ink tnum hidden sm:block">
                    {formatMinor(day.totalMinor, currency)}
                  </span>
                  <ChevronDown
                    size={18}
                    className={`text-ink-soft transition-transform duration-200 ease-spring ${
                      isExpanded ? "rotate-180" : "rotate-0"
                    }`}
                    aria-hidden="true"
                  />
                </div>
              </button>

              {/* Day Expanded Details: CSS Grid Spring Expansion */}
              <div
                id={contentId}
                role="region"
                aria-labelledby={headerId}
                data-expanded={isExpanded}
                className="grid grid-rows-[0fr] data-[expanded=true]:grid-rows-[1fr] transition-[grid-template-rows] duration-250 ease-spring overflow-hidden"
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="border-t border-hair/60 bg-canvas/30 p-4 pt-3 space-y-4">
                    {/* Who Paid Today */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-2">
                        Paid On This Day
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {payerEntries.map(([uid, amount]) => {
                          const name = memberMap.get(uid) ?? uid.slice(0, 8)
                          const isCurrent = uid === currentUserId
                          return (
                            <div
                              key={uid}
                              className="flex items-center justify-between rounded-xl border border-hair/60 bg-surface px-3 py-2 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <UserAvatar name={name} id={uid} isCurrentUser={isCurrent} size="sm" />
                                <span className="font-medium text-ink">
                                  {name} {isCurrent && "(You)"}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-ink tnum">
                                {formatMinor(amount, currency)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Day-Specific Minimal Settlements */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-2 flex items-center justify-between">
                        <span>Daily Settlement Transfers</span>
                        <span className="text-[10px] font-medium lowercase text-ink-faint">
                          (isolated to {day.label})
                        </span>
                      </h4>

                      {day.transfers.length === 0 ? (
                        <p className="rounded-xl border border-hair/40 bg-surface p-3 text-xs text-ink-soft">
                          ✨ All expenses for this day are equally balanced. No settlement needed.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {day.transfers.map((t, idx) => {
                            const fromName = memberMap.get(t.fromId) ?? t.fromId.slice(0, 8)
                            const toName = memberMap.get(t.toId) ?? t.toId.slice(0, 8)
                            const isFromMe = t.fromId === currentUserId
                            const isToMe = t.toId === currentUserId

                            return (
                              <li
                                key={idx}
                                className="flex items-center justify-between rounded-xl border border-hair/60 bg-surface p-3 text-xs shadow-2xs"
                              >
                                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                  <UserAvatar id={t.fromId} name={fromName} size="xs" />
                                  <span className="font-bold text-xs text-red-600 dark:text-red-400">
                                    {fromName} {isFromMe && "(You)"}
                                  </span>
                                  <span className="text-ink-soft text-[11px]">pays</span>
                                  <ArrowRight size={11} className="text-ink-faint shrink-0" />
                                  <UserAvatar id={t.toId} name={toName} size="xs" />
                                  <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">
                                    {toName} {isToMe && "(You)"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-3 shrink-0 ml-3">
                                  <span className="font-mono text-xs font-bold text-ink tnum">
                                    {formatMinor(t.amount, currency)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onSettle({
                                        fromId: t.fromId,
                                        toId: t.toId,
                                        amount: t.amount,
                                        dayLabel: `${day.label} settlement`,
                                      })
                                    }
                                    className="min-h-8 rounded-lg bg-brand px-2.5 text-[11px] font-bold text-white shadow-2xs hover:bg-blue-700 active:scale-[0.98] transition-all cursor-pointer"
                                    title={`Settle ${formatMinor(t.amount, currency)} for ${day.label}`}
                                  >
                                    Settle Day
                                  </button>
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
