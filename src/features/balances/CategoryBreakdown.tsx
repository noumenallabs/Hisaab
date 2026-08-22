import { useState } from "react"
import { formatMinor } from "@/lib/currency"
import {
  computeCategoryBreakdown,
  computeGroupCategorySummary,
  type ExpenseCategory,
} from "./categoryMath"
import { PieChart, ChevronDown, ChevronUp, User, Users } from "lucide-react"

export function CategoryBreakdown({
  expenses,
  members,
  currentUserId,
  baseCurrency,
}: {
  expenses: any[]
  members: { id: string; name: string }[]
  currentUserId?: string
  baseCurrency: string
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string>(
    currentUserId && members.some((m) => m.id === currentUserId)
      ? currentUserId
      : "group"
  )
  const [isExpanded, setIsExpanded] = useState(true)

  const isGroup = selectedMemberId === "group"
  const memberBreakdown = computeCategoryBreakdown(expenses, selectedMemberId)
  const groupSummary = computeGroupCategorySummary(expenses)

  // Active items
  const nonZeroMemberItems = memberBreakdown.filter(
    (c) => c.paidMinor > 0 || c.shareMinor > 0
  )
  const nonZeroGroupItems = groupSummary.categories.filter((c) => c.totalMinor > 0)

  const selectedMemberName =
    members.find((m) => m.id === selectedMemberId)?.name ?? "Your"

  return (
    <div className="rounded-2xl border border-hair bg-surface p-5 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <PieChart size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
              Category Breakdown
            </h2>
            <p className="text-xs text-ink-soft">
              {isGroup
                ? "Total spending distribution across the trip"
                : `${selectedMemberName}'s share and out-of-pocket spending`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Member Picker */}
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            className="min-h-9 rounded-xl border border-hair bg-surface px-3 py-1 text-xs font-semibold text-ink outline-none focus:border-brand"
            aria-label="Filter category breakdown by member"
          >
            <option value="group">👥 Entire Group</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                👤 {m.name} {m.id === currentUserId ? "(You)" : ""}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-hair bg-surface text-ink-soft hover:bg-canvas"
            aria-label={isExpanded ? "Collapse breakdown" : "Expand breakdown"}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-5 space-y-4">
          {/* Multi-color Group Distribution Bar */}
          {isGroup && groupSummary.totalTripMinor > 0 && (
            <div className="space-y-1.5">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-canvas border border-hair/50">
                {nonZeroGroupItems.map((c) => (
                  <div
                    key={c.category}
                    className={`${c.color} transition-all`}
                    style={{ width: `${c.percentage}%` }}
                    title={`${c.label}: ${c.percentage.toFixed(1)}%`}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[11px] text-ink-faint">
                <span>Trip Total: {formatMinor(groupSummary.totalTripMinor, baseCurrency)}</span>
                <span>{nonZeroGroupItems.length} active categories</span>
              </div>
            </div>
          )}

          {/* Empty State */}
          {(isGroup ? nonZeroGroupItems : nonZeroMemberItems).length === 0 ? (
            <div className="rounded-xl border border-dashed border-hair bg-canvas/40 p-6 text-center text-xs text-ink-soft">
              No categorized expenses found for this selection.
            </div>
          ) : isGroup ? (
            /* Group Category Cards */
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {nonZeroGroupItems.map((c) => (
                <div
                  key={c.category}
                  className="rounded-xl border border-hair bg-canvas/30 p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">
                      {c.emoji} {c.label}
                    </span>
                    <span className="font-bold text-brand">
                      {c.percentage.toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-base font-bold text-ink">
                    {formatMinor(c.totalMinor, baseCurrency)}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    {c.expenseCount} {c.expenseCount === 1 ? "expense" : "expenses"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            /* Member Personal Category Cards */
            <div className="grid gap-2.5 sm:grid-cols-2">
              {nonZeroMemberItems.map((c) => {
                const isCredit = c.netMinor > 0
                const isDebit = c.netMinor < 0

                return (
                  <div
                    key={c.category}
                    className="rounded-xl border border-hair bg-canvas/30 p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">
                        {c.emoji} {c.label}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isCredit
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : isDebit
                            ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                            : "bg-canvas text-ink-soft"
                        }`}
                      >
                        {isCredit
                          ? `+${formatMinor(c.netMinor, baseCurrency)}`
                          : isDebit
                          ? `-${formatMinor(Math.abs(c.netMinor), baseCurrency)}`
                          : "Settled"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-ink-soft bg-surface p-2 rounded-lg border border-hair/50">
                      <div>
                        <span className="block text-[10px] text-ink-faint uppercase font-bold">Paid</span>
                        <span className="font-mono font-bold text-ink">
                          {formatMinor(c.paidMinor, baseCurrency)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-ink-faint uppercase font-bold">Your Share</span>
                        <span className="font-mono font-bold text-ink">
                          {formatMinor(c.shareMinor, baseCurrency)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
