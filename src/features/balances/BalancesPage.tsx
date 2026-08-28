import { useParams } from "react-router"
import { useBalances, useSettlements } from "./hooks"
import { simplifyDebts } from "./balanceMath"
import { getSupabase } from "@/lib/supabase"
import { useTripMembers } from "@/features/trips/useMembers"
import { useExpenses } from "@/features/expenses/hooks"
import { formatMinor } from "@/lib/currency"
import { Skeleton, BalancesSkeleton } from "@/components/feedback/Skeleton"
import { UserAvatar } from "@/components/feedback/UserAvatar"
import { SettlementDialog } from "./SettlementDialog"
import { CategoryBreakdown } from "./CategoryBreakdown"
import { SettlementHistory } from "./SettlementHistory"
import { PairwiseBreakdownDialog } from "./PairwiseBreakdownDialog"
import { ShareSummaryModal } from "./ShareSummaryModal"
import { shareTripSummary } from "./shareSummary"
import { DailyBreakdown } from "./DailyBreakdown"
import { computeDayDebts, computeDayTimeline } from "./dayMath"
import {
  computeCategoryDebts,
  computeGroupCategorySummary,
  type ExpenseCategory,
  CATEGORY_META,
} from "./categoryMath"
import { useToast } from "@/components/feedback/ToastProvider"
import { useState, useMemo } from "react"
import { useAuth } from "@/lib/auth"
import { useTrip } from "@/features/trips/hooks"
import { queryClient } from "@/lib/queryClient"
import { Share2, Info, Check, Filter, Calendar } from "lucide-react"

export function BalancesPage() {
  const { tripId } = useParams()
  const { toast } = useToast()
  const { data, isLoading } = useBalances(tripId!)
  const { data: membersData } = useTripMembers(tripId!)
  const { data: expensesData } = useExpenses(tripId!)
  const { data: settlementsData } = useSettlements(tripId!)
  const { user } = useAuth()
  const { data: trip } = useTrip(tripId!)
  const supabase = getSupabase()

  const isArchived = (trip as any)?.status === "archived"
  const isSettled = (trip as any)?.status === "settled"
  const baseCurrency = (trip as any)?.base_currency ?? "INR"

  const [settle, setSettle] = useState<{
    fromId: string
    toId: string
    amount: number
    categoryLabel?: string
    dayLabel?: string
  } | null>(null)
  const [settleViewMode, setSettleViewMode] = useState<"total" | "day" | "category">("total")
  const [debtFilter, setDebtFilter] = useState<"all" | "mine">("all")
  const [settleCategory, setSettleCategory] = useState<ExpenseCategory | "all">("all")
  const [settleDate, setSettleDate] = useState<string>("all")
  const [pairwisePair, setPairwisePair] = useState<{
    fromId: string
    toId: string
    fromName: string
    toName: string
    amount: number
  } | null>(null)

  const members: any[] = useMemo(
    () => (membersData ?? []).map((m: any) => ({ id: m.user_id ?? m.id, name: m.name, avatar: (m.name ?? "?").slice(0, 2).toUpperCase() })),
    [membersData]
  )
  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members]
  )

  const membersLoading = !membersData
  let rows: Record<string, { paid: number; owed: number; sent: number; received: number; net: number }> = {}
  let net: Record<string, number> = {}
  let transfers: { fromId: string; toId: string; amount: number }[] = []

  if (data) {
    const list = data as any[]
    rows = Object.fromEntries(
      list.map((r) => [
        r.user_id,
        {
          paid: r.paid_minor ?? 0,
          owed: r.owed_minor ?? 0,
          sent: r.sent_minor ?? 0,
          received: r.received_minor ?? 0,
          net: r.net_minor ?? 0,
        },
      ])
    ) as any
    net = Object.fromEntries(list.map((r) => [r.user_id, r.net_minor ?? 0])) as any
    transfers = simplifyDebts(net)
  }

  const categorySettlements = useMemo(() => {
    if (settleCategory === "all") {
      return { transfers, net }
    }
    return computeCategoryDebts(expensesData ?? [], settleCategory)
  }, [settleCategory, transfers, net, expensesData])

  const dayTimeline = useMemo(
    () => computeDayTimeline(expensesData ?? [], (trip as any)?.start_date),
    [expensesData, trip]
  )

  const daySettlements = useMemo(() => {
    if (settleDate === "all") {
      return { transfers, net }
    }
    return computeDayDebts(expensesData ?? [], settleDate)
  }, [settleDate, transfers, net, expensesData])

  const currentTransfers = useMemo(() => {
    if (settleViewMode === "category") {
      return categorySettlements.transfers
    }
    if (settleViewMode === "day") {
      return daySettlements.transfers
    }
    return transfers
  }, [settleViewMode, categorySettlements.transfers, daySettlements.transfers, transfers])

  const visibleTransfers = useMemo(() => {
    if (debtFilter === "mine" && user?.id) {
      return currentTransfers.filter((t) => t.fromId === user.id || t.toId === user.id)
    }
    return currentTransfers
  }, [currentTransfers, debtFilter, user?.id])

  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  const activeExpenses = useMemo(
    () => ((expensesData as any[]) ?? []).filter((e: any) => !e.deleted_at),
    [expensesData]
  )
  const totalTripMinor = useMemo(
    () => activeExpenses.reduce((s: number, e: any) => s + (e.amount_minor ?? e.amount ?? 0), 0),
    [activeExpenses]
  )

  const groupCategorySummary = useMemo(
    () => computeGroupCategorySummary(activeExpenses),
    [activeExpenses]
  )

  const summaryCardOptions = useMemo(
    () => ({
      tripName: (trip as any)?.name ?? "Trip",
      currency: baseCurrency,
      totalMinor: totalTripMinor,
      expenseCount: activeExpenses.length,
      memberCount: members.length,
      destination: (trip as any)?.destination,
      dates:
        (trip as any)?.start_date && (trip as any)?.end_date
          ? `${(trip as any).start_date} → ${(trip as any).end_date}`
          : undefined,
      transfers: transfers.map((t) => ({
        fromName: memberMap.get(t.fromId) ?? "Member",
        toName: memberMap.get(t.toId) ?? "Member",
        amountMinor: t.amount,
      })),
      categories: groupCategorySummary.categories.map((c) => ({
        label: c.label,
        emoji: c.emoji,
        totalMinor: c.totalMinor,
        percentage: c.percentage,
      })),
    }),
    [
      trip,
      baseCurrency,
      totalTripMinor,
      activeExpenses.length,
      members.length,
      transfers,
      memberMap,
      groupCategorySummary,
    ]
  )

  const activeCategories = useMemo(() => {
    const cats = new Set<ExpenseCategory>()
    for (const exp of activeExpenses) {
      const cat = exp.category as ExpenseCategory
      if (cat && CATEGORY_META[cat]) {
        cats.add(cat)
      }
    }
    return Array.from(cats)
  }, [activeExpenses])

  if (supabase && (isLoading || membersLoading)) return <BalancesSkeleton />
  if (supabase && !membersLoading && members.length === 0)
    return (
      <div className="rounded-md bg-owe-soft p-4 text-sm text-owe" role="alert">
        Failed to load members — please retry.{" "}
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["trip_members", tripId] })}
          className="ml-2 min-h-11 underline"
        >
          Retry
        </button>
      </div>
    )

  return (
    <div className="space-y-6">
      {/* Top Header with Share Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Balances & Settlements</h1>
          <p className="text-xs text-ink-soft">
            Review each member's net position and settle debts with minimum transfers
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsShareModalOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface border border-hair px-4 text-xs font-bold text-ink shadow-2xs hover:bg-canvas transition-colors"
          aria-label="Share trip settlement summary"
        >
          <Share2 size={15} className="text-brand" /> Share summary
        </button>
      </div>

      {isArchived && (
        <p
          role="alert"
          className="rounded-xl border border-hair bg-canvas/80 px-4 py-2.5 text-sm font-semibold text-ink-soft"
        >
          Archived — read-only. Settlements disabled.
        </p>
      )}
      {isSettled && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-100 px-4 py-2.5 text-sm font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300"
        >
          Settled — all balances zero. Owner can reopen.
        </p>
      )}
      {supabase && members.length === 1 && (
        <p className="text-sm text-ink-soft" role="status">
          Only you in this trip — invite others from Settings to split expenses.
        </p>
      )}

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Net Position Summary Cards */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft">
              Individual Positions ({members.length})
            </h2>
            <span className="text-xs text-ink-faint">All active expenses</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {members.map((m) => {
              const r = rows[m.id] ?? { paid: 0, owed: 0, sent: 0, received: 0, net: 0 }
              const v = r.net
              const isPositive = v > 0
              const isNegative = v < 0

              return (
                <div
                  key={m.id}
                  className="rounded-2xl border border-hair bg-surface p-4 shadow-2xs transition-all hover:shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar
                        name={m.name}
                        id={m.id}
                        isCurrentUser={m.id === user?.id}
                        size="md"
                      />
                      <p className="text-sm font-bold text-ink">
                        {m.name}
                        {m.id === user?.id && (
                          <span className="ml-1.5 rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                            You
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        isPositive
                          ? "border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : isNegative
                          ? "border border-red-200 bg-red-100 text-red-800 dark:border-red-800/60 dark:bg-red-950/60 dark:text-red-300"
                          : "border border-hair bg-canvas text-ink-soft"
                      }`}
                    >
                      {isPositive ? "Receives" : isNegative ? "Owes" : "Settled"}
                    </span>
                  </div>

                  <p
                    className={`mt-3 font-mono text-xl font-bold tabular-nums tracking-tight ${
                      isPositive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : isNegative
                        ? "text-red-600 dark:text-red-400"
                        : "text-ink"
                    }`}
                  >
                    {formatMinor(v, baseCurrency)}
                  </p>

                  <div className="mt-3 rounded-xl bg-canvas/50 p-2.5 text-xs grid grid-cols-2 gap-x-2 gap-y-1 border border-hair/30">
                    <div className="flex justify-between text-ink-soft">
                      <span>Paid:</span>{" "}
                      <span className="font-mono font-semibold text-ink">
                        {formatMinor(r.paid, baseCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-ink-soft">
                      <span>Share:</span>{" "}
                      <span className="font-mono font-semibold text-ink">
                        {formatMinor(r.owed, baseCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-ink-soft">
                      <span>Sent:</span>{" "}
                      <span className="font-mono font-semibold text-ink">
                        {formatMinor(r.sent, baseCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-ink-soft">
                      <span>Recv:</span>{" "}
                      <span className="font-mono font-semibold text-ink">
                        {formatMinor(r.received, baseCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Column: Simplified Transfers / Settle */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-2xl border border-hair bg-surface p-5 shadow-2xs sticky top-20">
            {/* Header Title + My Debts toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hair/40 pb-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
                  Simplified Settlements
                </h2>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {settleViewMode === "total"
                    ? "Optimized payment paths to clear all debts"
                    : settleViewMode === "day"
                    ? settleDate === "all"
                      ? "Combined debt settlement across all days"
                      : `Isolated debts for ${dayTimeline.find((d) => d.date === settleDate)?.label ?? settleDate}`
                    : settleCategory === "all"
                    ? "Combined category debt settlement"
                    : `Debts calculated for ${CATEGORY_META[settleCategory]?.emoji} ${CATEGORY_META[settleCategory]?.label}`}
                </p>
              </div>

              {/* My Debts vs All Filter */}
              {user?.id && currentTransfers.length > 0 && (
                <div className="flex rounded-xl border border-hair bg-canvas p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setDebtFilter("all")}
                    className={`rounded-lg px-2.5 py-1 transition-colors ${
                      debtFilter === "all"
                        ? "bg-surface text-brand shadow-2xs font-bold"
                        : "text-ink-soft"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setDebtFilter("mine")}
                    className={`rounded-lg px-2.5 py-1 transition-colors ${
                      debtFilter === "mine"
                        ? "bg-surface text-brand shadow-2xs font-bold"
                        : "text-ink-soft"
                    }`}
                  >
                    My debts
                  </button>
                </div>
              )}
            </div>

            {/* View Mode Switcher: Total / By Day / By Category */}
            <div className="pt-3 pb-2 border-b border-hair/40">
              <div className="flex items-center gap-1 rounded-xl bg-canvas p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSettleViewMode("total")}
                  className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                    settleViewMode === "total"
                      ? "bg-surface text-brand shadow-2xs font-bold"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  🌐 Overall
                </button>
                <button
                  type="button"
                  onClick={() => setSettleViewMode("day")}
                  className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                    settleViewMode === "day"
                      ? "bg-surface text-brand shadow-2xs font-bold"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  📅 By Day ({dayTimeline.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSettleViewMode("category")}
                  className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                    settleViewMode === "category"
                      ? "bg-surface text-brand shadow-2xs font-bold"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  🏷️ By Category
                </button>
              </div>
            </div>

            {/* Day Filter Pills Ribbon (when in Day mode) */}
            {settleViewMode === "day" && dayTimeline.length > 0 && (
              <div className="pt-2 pb-1 border-b border-hair/40">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                  <button
                    type="button"
                    onClick={() => setSettleDate("all")}
                    className={`inline-flex items-center gap-1 shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      settleDate === "all"
                        ? "bg-brand text-white shadow-xs"
                        : "border border-hair bg-canvas/60 text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <span>🌐</span> All Days
                  </button>
                  {dayTimeline.map((day) => {
                    const isSelected = settleDate === day.date
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => setSettleDate(day.date)}
                        className={`inline-flex items-center gap-1.5 shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                          isSelected
                            ? "bg-brand text-white shadow-xs"
                            : "border border-hair bg-canvas/60 text-ink-soft hover:bg-canvas hover:text-ink"
                        }`}
                      >
                        <span>D{day.dayNumber}</span>
                        <span className="font-normal opacity-90">{day.date.slice(5)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Category Filter Pills Ribbon (when in Category mode) */}
            {settleViewMode === "category" && activeCategories.length > 0 && (
              <div className="pt-2 pb-1 border-b border-hair/40">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                  <button
                    type="button"
                    onClick={() => setSettleCategory("all")}
                    className={`inline-flex items-center gap-1 shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      settleCategory === "all"
                        ? "bg-brand text-white shadow-xs"
                        : "border border-hair bg-canvas/60 text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <span>🌐</span> All
                  </button>
                  {activeCategories.map((cat) => {
                    const meta = CATEGORY_META[cat]
                    const isSelected = settleCategory === cat
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSettleCategory(cat)}
                        className={`inline-flex items-center gap-1.5 shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                          isSelected
                            ? "bg-brand text-white shadow-xs"
                            : "border border-hair bg-canvas/60 text-ink-soft hover:bg-canvas hover:text-ink"
                        }`}
                      >
                        <span>{meta.emoji}</span>
                        <span>{meta.label.split(" ")[0]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {currentTransfers.length === 0 ? (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-800/60 dark:bg-emerald-950/40">
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  🎉 All settled up!
                </p>
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                  {settleCategory === "all"
                    ? "No outstanding transfers required in this trip."
                    : `No outstanding debts for ${CATEGORY_META[settleCategory]?.label}.`}
                </p>
              </div>
            ) : visibleTransfers.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-hair bg-canvas/30 p-4 text-center text-xs text-ink-soft">
                You have no outstanding debts in this category.
              </div>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {visibleTransfers.map((t, i) => {
                  const canSettle =
                    !isArchived &&
                    !isSettled &&
                    (user?.id === t.fromId ||
                      (membersData as any)?.find((m: any) => m.user_id === user?.id)?.role === "owner" ||
                      !supabase)
                  const fromMemberName = memberMap.get(t.fromId) ?? "Member"
                  const toMemberName = memberMap.get(t.toId) ?? "Member"

                  return (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-hair bg-canvas/30 p-3 text-sm shadow-2xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <UserAvatar id={t.fromId} name={fromMemberName} size="xs" />
                          <span className="font-bold text-xs text-red-600 dark:text-red-400">
                            {fromMemberName}
                          </span>
                          <span className="text-[11px] text-ink-soft font-medium">pays</span>
                          <UserAvatar id={t.toId} name={toMemberName} size="xs" />
                          <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">
                            {toMemberName}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-sm font-bold text-ink tnum">
                          {formatMinor(t.amount, baseCurrency)}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setPairwisePair({
                              fromId: t.fromId,
                              toId: t.toId,
                              fromName: fromMemberName,
                              toName: toMemberName,
                              amount: t.amount,
                            })
                          }
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-brand transition-colors"
                        >
                          <Info size={12} /> Why this amount?
                        </button>
                      </div>
                      {canSettle && (
                        <button
                          onClick={() => {
                            const dayObj = settleDate !== "all" ? dayTimeline.find((d) => d.date === settleDate) : null
                            setSettle({
                              fromId: t.fromId,
                              toId: t.toId,
                              amount: t.amount,
                              dayLabel:
                                settleViewMode === "day" && dayObj
                                  ? `${dayObj.label} settlement`
                                  : undefined,
                              categoryLabel:
                                settleViewMode === "category" && settleCategory !== "all"
                                  ? `${CATEGORY_META[settleCategory]?.emoji} ${CATEGORY_META[settleCategory]?.label}`
                                  : undefined,
                            })
                          }}
                          className="shrink-0 min-h-9 rounded-xl bg-brand px-3.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition-colors"
                          title="Record settlement to clear this debt"
                          aria-label={`Settle ${formatMinor(t.amount, baseCurrency)}`}
                        >
                          Settle
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Day-Wise Settlement Timeline Section */}
      <DailyBreakdown
        timeline={dayTimeline}
        currency={baseCurrency}
        memberMap={memberMap}
        currentUserId={user?.id}
        onSettle={(t) =>
          setSettle({
            fromId: t.fromId,
            toId: t.toId,
            amount: t.amount,
            dayLabel: t.dayLabel,
          })
        }
      />

      {/* Category-Level Breakdown Section */}
      <CategoryBreakdown
        expenses={expensesData ?? []}
        members={members}
        currentUserId={user?.id}
        baseCurrency={baseCurrency}
      />

      {/* Settlement History Ledger */}
      <SettlementHistory
        settlements={settlementsData ?? []}
        memberMap={memberMap}
        baseCurrency={baseCurrency}
      />

      {/* Settlement Dialog */}
      {settle && (
        <SettlementDialog
          open
          onClose={() => setSettle(null)}
          tripId={tripId!}
          fromId={settle.fromId}
          toId={settle.toId}
          fromName={memberMap.get(settle.fromId)}
          toName={memberMap.get(settle.toId)}
          outstandingMinor={settle.amount}
          currency={baseCurrency}
          defaultNote={
            settle.dayLabel
              ? settle.dayLabel
              : settle.categoryLabel
              ? `Settlement for ${settle.categoryLabel}`
              : undefined
          }
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["balances", tripId] })
            queryClient.invalidateQueries({ queryKey: ["expenses", tripId] })
            queryClient.invalidateQueries({ queryKey: ["settlements", tripId] })
            queryClient.invalidateQueries({ queryKey: ["activity", tripId] })
            queryClient.invalidateQueries({ queryKey: ["trip", tripId] })
          }}
        />
      )}

      {/* Pairwise Breakdown Explanation Dialog */}
      {pairwisePair && (
        <PairwiseBreakdownDialog
          open
          onClose={() => setPairwisePair(null)}
          expenses={expensesData ?? []}
          fromId={pairwisePair.fromId}
          toId={pairwisePair.toId}
          fromName={pairwisePair.fromName}
          toName={pairwisePair.toName}
          transferAmountMinor={pairwisePair.amount}
          baseCurrency={baseCurrency}
        />
      )}

      {/* Share Summary Image & Text Snapshot Dialog */}
      <ShareSummaryModal
        open={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        opts={summaryCardOptions}
      />
    </div>
  )
}
