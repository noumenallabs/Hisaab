import { useParams } from "react-router"
import { useBalances, useSettlements } from "./hooks"
import { simplifyDebts } from "./balanceMath"
import { getSupabase } from "@/lib/supabase"
import { useTripMembers } from "@/features/trips/useMembers"
import { useExpenses } from "@/features/expenses/hooks"
import { formatMinor } from "@/lib/currency"
import { Skeleton } from "@/components/feedback/Skeleton"
import { SettlementDialog } from "./SettlementDialog"
import { CategoryBreakdown } from "./CategoryBreakdown"
import { SettlementHistory } from "./SettlementHistory"
import { PairwiseBreakdownDialog } from "./PairwiseBreakdownDialog"
import { shareTripSummary } from "./shareSummary"
import {
  computeCategoryDebts,
  type ExpenseCategory,
  CATEGORY_META,
} from "./categoryMath"
import { useToast } from "@/components/feedback/ToastProvider"
import { useState, useMemo } from "react"
import { useAuth } from "@/lib/auth"
import { useTrip } from "@/features/trips/hooks"
import { queryClient } from "@/lib/queryClient"
import { Share2, Info, Check, Filter } from "lucide-react"

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
  } | null>(null)
  const [debtFilter, setDebtFilter] = useState<"all" | "mine">("all")
  const [settleCategory, setSettleCategory] = useState<ExpenseCategory | "all">("all")
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

  const currentTransfers = categorySettlements.transfers

  const visibleTransfers = useMemo(() => {
    if (debtFilter === "mine" && user?.id) {
      return currentTransfers.filter((t) => t.fromId === user.id || t.toId === user.id)
    }
    return currentTransfers
  }, [currentTransfers, debtFilter, user?.id])

  async function handleShare() {
    const activeExpenses = ((expensesData as any[]) ?? []).filter((e) => !e.deleted_at)
    const totalMinor = activeExpenses.reduce((s: number, e: any) => s + (e.amount_minor ?? e.amount ?? 0), 0)

    const shareTransfers = transfers.map((t) => ({
      fromName: memberMap.get(t.fromId) ?? "Member",
      toName: memberMap.get(t.toId) ?? "Member",
      amountMinor: t.amount,
    }))

    const res = await shareTripSummary({
      tripName: (trip as any)?.name ?? "Trip",
      currency: baseCurrency,
      totalMinor,
      expenseCount: activeExpenses.length,
      transfers: shareTransfers,
      tripUrl: window.location.href,
    })

    if (res === "copied") {
      toast("Summary copied to clipboard! Ready to paste.", "success")
    }
  }

  if (supabase && isLoading) return <Skeleton className="h-40" />
  if (supabase && membersLoading) return <Skeleton className="h-40" />
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
          onClick={handleShare}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface border border-hair px-4 text-xs font-bold text-ink shadow-2xs hover:bg-canvas transition-colors"
          aria-label="Share trip settlement summary"
        >
          <Share2 size={15} className="text-brand" /> Share summary
        </button>
      </div>

      {isArchived && (
        <p
          role="alert"
          className="rounded-xl border border-slate-700/60 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
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

      {/* 2-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Member Positions */}
        <div className="space-y-4 lg:col-span-7">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft">
            Member Positions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {members.map((m: any) => {
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
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                        {(m.name ?? "?")[0].toUpperCase()}
                      </span>
                      <p className="text-sm font-bold text-ink">{m.name}</p>
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hair/50 pb-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
                  {settleCategory === "all"
                    ? "Simplified Settlements"
                    : `${CATEGORY_META[settleCategory]?.emoji} ${CATEGORY_META[settleCategory]?.label}`}
                </h2>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {settleCategory === "all"
                    ? "Optimized payment paths to clear all debts"
                    : `Debts calculated exclusively for ${CATEGORY_META[settleCategory]?.label}`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={settleCategory}
                  onChange={(e) => setSettleCategory(e.target.value as any)}
                  className="min-h-8 rounded-lg border border-hair bg-canvas px-2 text-xs font-semibold text-ink outline-none focus:border-brand"
                  aria-label="Filter settlements by category"
                >
                  <option value="all">🌐 All Categories</option>
                  <option value="accommodation">🏨 Stay & Lodging</option>
                  <option value="food">🍕 Food & Dining</option>
                  <option value="transport">🚕 Transport & Fuel</option>
                  <option value="tickets">🎟️ Tickets & Activities</option>
                  <option value="shopping">🛍️ Shopping</option>
                  <option value="other">📦 Other / Misc</option>
                </select>

                {/* My Debts vs All Filter */}
                {user?.id && currentTransfers.length > 0 && (
                  <div className="flex rounded-lg border border-hair bg-canvas p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setDebtFilter("all")}
                      className={`rounded-md px-2 py-0.5 transition-colors ${
                        debtFilter === "all"
                          ? "bg-surface text-brand shadow-2xs font-bold"
                          : "text-ink-soft"
                      }`}
                    >
                      All ({currentTransfers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDebtFilter("mine")}
                      className={`rounded-md px-2 py-0.5 transition-colors ${
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
            </div>

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
                      className="flex items-center justify-between rounded-xl border border-hair bg-canvas/30 p-3 text-sm"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold text-ink">
                          <span className="font-bold text-red-600 dark:text-red-400">
                            {fromMemberName}
                          </span>{" "}
                          pays{" "}
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {toMemberName}
                          </span>
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-bold text-ink">
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
                          onClick={() =>
                            setSettle({
                              fromId: t.fromId,
                              toId: t.toId,
                              amount: t.amount,
                              categoryLabel:
                                settleCategory !== "all"
                                  ? `${CATEGORY_META[settleCategory]?.emoji} ${CATEGORY_META[settleCategory]?.label}`
                                  : undefined,
                            })
                          }
                          className="shrink-0 min-h-9 rounded-xl bg-brand px-3.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition-colors"
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
          defaultNote={settle.categoryLabel ? `Settlement for ${settle.categoryLabel}` : undefined}
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
    </div>
  )
}
