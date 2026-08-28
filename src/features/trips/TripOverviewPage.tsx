import { Link, useParams } from "react-router"
import { useTrip } from "./hooks"
import { useTripMembers } from "./useMembers"
import { useExpenses } from "@/features/expenses/hooks"
import { useBalances } from "@/features/balances/hooks"
import { getSupabase } from "@/lib/supabase"
import { formatMinor } from "@/lib/currency"
import { Skeleton } from "@/components/feedback/Skeleton"
import {
  computeGroupCategorySummary,
  CATEGORY_META,
  type ExpenseCategory,
} from "@/features/balances/categoryMath"
import { computeDayTimeline } from "@/features/balances/dayMath"
import { simplifyDebts } from "@/features/balances/balanceMath"
import { Donut, DailyBars } from "@/charts"
import {
  Plus,
  Receipt,
  Scale,
  Activity as ActivityIcon,
  Settings2,
  Users,
  ArrowRight,
  TrendingUp,
  Share2,
  UserPlus,
  HandCoins,
  Sparkles,
  CheckCircle2,
  Calendar,
  PieChart,
} from "lucide-react"
import { UserAvatar } from "@/components/feedback/UserAvatar"
import { useAuth } from "@/lib/auth"
import { useState, useMemo } from "react"
import { SettlementDialog } from "@/features/balances/SettlementDialog"
import { ShareSummaryModal } from "@/features/balances/ShareSummaryModal"
import { InviteTravelerModal } from "./InviteTravelerModal"
import { useQueryClient } from "@tanstack/react-query"

export function TripOverviewPage() {
  const { tripId } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: trip, isLoading } = useTrip(tripId!)
  const { data: membersData } = useTripMembers(tripId ?? "")
  const { data: expensesData } = useExpenses(tripId!)
  const { data: balancesData } = useBalances(tripId!)
  const supabase = getSupabase()

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [settleTransfer, setSettleTransfer] = useState<{
    fromId: string
    toId: string
    amount: number
  } | null>(null)
  const [isGeneralSettleOpen, setIsGeneralSettleOpen] = useState(false)

  if (isLoading) return <Skeleton className="h-48 rounded-2xl" />
  if (!trip)
    return (
      <div className="p-6 text-center text-sm text-ink-soft" role="alert">
        Trip not found or you lack access.
      </div>
    )

  const t = trip as any
  const isArchived = t.status === "archived"
  const isSettled = t.status === "settled"
  const baseCurrency = t.base_currency ?? "INR"

  const memberList = (membersData as any[]) ?? []
  const memberCount = memberList.length
  const memberMap = new Map<string, string>(
    memberList.map((m: any) => [
      String(m.user_id ?? m.id),
      String(m.name ?? m.email ?? (m.user_id ?? m.id)?.slice(0, 8)),
    ])
  )

  const expenseList = (expensesData as any[]) ?? []
  const activeExpenses = expenseList.filter((e: any) => !e.deleted_at && !e.deleted)
  const expenseCount = activeExpenses.length
  const totalMinor = activeExpenses.reduce(
    (s: number, e: any) => s + (e.amount_minor ?? e.amount ?? 0),
    0
  )
  const avgMinor = memberCount > 0 ? Math.round(totalMinor / memberCount) : 0
  const recentExpenses = activeExpenses.slice(0, 5)

  // Derive client-side balance map if RPC balances not present
  const clientNetMap: Record<string, number> = {}
  const clientPaidMap: Record<string, number> = {}
  const clientShareMap: Record<string, number> = {}

  for (const m of memberList) {
    const uid = m.user_id ?? m.id
    clientNetMap[uid] = 0
    clientPaidMap[uid] = 0
    clientShareMap[uid] = 0
  }

  for (const exp of activeExpenses) {
    const payers = exp.expense_payers ?? exp.payers ?? []
    for (const p of payers) {
      const pid = p.user_id ?? p.userId
      const amt = p.amount_paid_minor ?? p.amount ?? 0
      clientPaidMap[pid] = (clientPaidMap[pid] ?? 0) + amt
      clientNetMap[pid] = (clientNetMap[pid] ?? 0) + amt
    }
    const splits = exp.expense_splits ?? exp.splits ?? []
    for (const s of splits) {
      const sid = s.user_id ?? s.userId
      const amt = s.amount_owed_minor ?? s.amount ?? 0
      clientShareMap[sid] = (clientShareMap[sid] ?? 0) + amt
      clientNetMap[sid] = (clientNetMap[sid] ?? 0) - amt
    }
  }

  // Use balancesData if available, fallback to client calculation
  const balanceRows: Record<
    string,
    { paid: number; owed: number; sent: number; received: number; net: number }
  > = {}
  let netBalances: Record<string, number> = {}

  if (balancesData && (balancesData as any[]).length > 0) {
    const list = balancesData as any[]
    for (const r of list) {
      balanceRows[r.user_id] = {
        paid: r.paid_minor ?? 0,
        owed: r.owed_minor ?? 0,
        sent: r.sent_minor ?? 0,
        received: r.received_minor ?? 0,
        net: r.net_minor ?? 0,
      }
      netBalances[r.user_id] = r.net_minor ?? 0
    }
  } else {
    for (const m of memberList) {
      const uid = m.user_id ?? m.id
      balanceRows[uid] = {
        paid: clientPaidMap[uid] ?? 0,
        owed: clientShareMap[uid] ?? 0,
        sent: 0,
        received: 0,
        net: clientNetMap[uid] ?? 0,
      }
      netBalances[uid] = clientNetMap[uid] ?? 0
    }
  }

  const simplifiedTransfers = simplifyDebts(netBalances)

  // Personal standing of the logged in user
  const currentUserId = user?.id
  const isMember = currentUserId ? !!balanceRows[currentUserId] : false
  const currentUserRow = isMember && currentUserId ? balanceRows[currentUserId] : null
  const currentUserNetMinor = currentUserRow?.net ?? 0
  const isUserOwed = currentUserNetMinor > 0
  const isUserOwing = currentUserNetMinor < 0
  const isUserSettled = currentUserNetMinor === 0

  // Category and day timelines
  const groupCategorySummary = computeGroupCategorySummary(activeExpenses)
  const activeCategories = groupCategorySummary.categories.filter((c) => c.totalMinor > 0)
  const dayTimeline = computeDayTimeline(activeExpenses, t.start_date)

  const avgDailySpend =
    dayTimeline.length > 0 ? Math.round(totalMinor / dayTimeline.length) : 0
  const peakDay =
    dayTimeline.length > 0
      ? dayTimeline.reduce((prev, cur) => (cur.totalMinor > prev.totalMinor ? cur : prev), dayTimeline[0])
      : null

  // Category chart donut data
  const donutSegments = activeCategories.map((c) => ({
    label: c.label,
    value: c.totalMinor,
    color:
      c.category === "food"
        ? "#3b82f6"
        : c.category === "transport"
        ? "#f59e0b"
        : c.category === "accommodation"
        ? "#8b5cf6"
        : c.category === "tickets"
        ? "#ec4899"
        : c.category === "shopping"
        ? "#10b981"
        : "#64748b",
  }))

  const summaryCardOptions = {
    tripName: t.name ?? "Trip",
    currency: baseCurrency,
    totalMinor,
    expenseCount,
    memberCount,
    destination: t.destination,
    dates: t.start_date && t.end_date ? `${t.start_date} → ${t.end_date}` : undefined,
    transfers: simplifiedTransfers.map((tr) => ({
      fromName: memberMap.get(tr.fromId) ?? "Member",
      toName: memberMap.get(tr.toId) ?? "Member",
      amountMinor: tr.amount,
    })),
    categories: groupCategorySummary.categories.map((c) => ({
      label: c.label,
      emoji: c.emoji,
      totalMinor: c.totalMinor,
      percentage: c.percentage,
    })),
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Quick Action Hub */}
      <div className="rounded-2xl border border-hair bg-surface p-6 sm:p-8 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  t.status === "active"
                    ? "border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : "border border-hair bg-canvas text-ink-soft"
                }`}
              >
                {t.status}
              </span>
              <span className="text-xs font-semibold text-ink-soft">
                {baseCurrency}
              </span>
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              {t.name}
            </h1>
            {t.destination && (
              <p className="mt-1 text-sm text-ink-soft">
                📍 {t.destination} {t.start_date ? `· ${t.start_date} → ${t.end_date}` : ""}
              </p>
            )}
          </div>

          {!isArchived && (
            <div className="flex flex-wrap items-center gap-2">
              {!isSettled && (
                <Link
                  to={`/trips/${tripId}/expenses/new`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
                  aria-label="Add new expense"
                >
                  <Plus size={16} /> Add expense
                </Link>
              )}
              {!isSettled && simplifiedTransfers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsGeneralSettleOpen(true)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-hair bg-surface px-3.5 text-xs font-bold text-ink shadow-2xs hover:bg-canvas transition-colors"
                  aria-label="Settle debts"
                >
                  <HandCoins size={15} className="text-brand" /> Settle up
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-hair bg-surface px-3.5 text-xs font-bold text-ink shadow-2xs hover:bg-canvas transition-colors"
                aria-label="Invite traveler"
              >
                <UserPlus size={15} className="text-brand" /> Invite
              </button>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-hair bg-surface px-3.5 text-xs font-bold text-ink shadow-2xs hover:bg-canvas transition-colors"
                aria-label="Share trip summary"
              >
                <Share2 size={15} className="text-brand" /> Share
              </button>
            </div>
          )}
        </div>

        {isArchived && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-hair bg-canvas/80 px-4 py-2.5 text-sm font-semibold text-ink-soft"
          >
            Archived trip — read-only mode.
          </p>
        )}
      </div>

      {/* Personal Standing Hero Banner */}
      {currentUserRow && (
        <div
          className={`rounded-2xl border p-5 shadow-2xs transition-all ${
            isUserOwed
              ? "border-emerald-200 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-surface dark:border-emerald-800/60 dark:bg-emerald-950/30"
              : isUserOwing
              ? "border-rose-200 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-surface dark:border-rose-800/60 dark:bg-rose-950/30"
              : "border-hair bg-surface"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <UserAvatar
                id={currentUserId!}
                name={user?.name ?? (currentUserId ? memberMap.get(currentUserId) : undefined) ?? "You"}
                isCurrentUser
                size="lg"
              />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                  {isUserOwed
                    ? "Personal Balance · You are owed"
                    : isUserOwing
                    ? "Personal Balance · You owe"
                    : "Personal Balance · You're all settled"}
                </p>
                <p
                  className={`mt-0.5 font-mono text-2xl font-bold tracking-tight ${
                    isUserOwed
                      ? "text-emerald-600 dark:text-emerald-400"
                      : isUserOwing
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-ink"
                  }`}
                >
                  {formatMinor(Math.abs(currentUserNetMinor), baseCurrency)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isUserOwing && !isArchived && !isSettled && (
                <button
                  type="button"
                  onClick={() => setIsGeneralSettleOpen(true)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white shadow-2xs hover:bg-rose-700 transition-colors"
                >
                  Settle your share →
                </button>
              )}
              <Link
                to={`/trips/${tripId}/balances`}
                className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-hair bg-surface px-3.5 text-xs font-bold text-ink hover:bg-canvas transition-colors shadow-2xs"
                aria-label="Balances matrix"
              >
                Balances matrix →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Top Stat Cards with Asymmetric Hierarchy */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        {/* Total Spending - Hero Feature Card (Spans 5 cols on lg) */}
        <div className="rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/5 via-surface to-surface p-6 shadow-2xs sm:col-span-2 lg:col-span-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-brand">
              Total Spending
            </p>
            <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
              {baseCurrency}
            </span>
          </div>
          <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-ink">
            {formatMinor(totalMinor, baseCurrency)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {`Across ${expenseCount} recorded ${expenseCount === 1 ? "transaction" : "transactions"}`}
          </p>
        </div>

        {/* Avg / Person (Spans 3 cols on lg) */}
        <div className="rounded-2xl border border-hair bg-surface p-5 shadow-2xs lg:col-span-3">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            Avg / Person
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink">
            {formatMinor(avgMinor, baseCurrency)}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">
            For {memberCount} members
          </p>
        </div>

        {/* Expenses Count (Spans 2 cols on lg) */}
        <div className="rounded-2xl border border-hair bg-surface p-5 shadow-2xs lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            Expenses
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink">
            {expenseCount}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">Total entries</p>
        </div>

        {/* Trip Members (Spans 2 cols on lg) */}
        <div className="rounded-2xl border border-hair bg-surface p-5 shadow-2xs lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            Members
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink">
            {memberCount}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">Active in group</p>
        </div>
      </div>

      {/* Zero-Expense Onboarding Checklist or Active Content */}
      {expenseCount === 0 ? (
        <div className="rounded-2xl border border-hair bg-surface p-8 shadow-xs text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-3xl border border-brand/20">
            ✈️
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-ink">
              Welcome to your Travel Finance Hub!
            </h2>
            <p className="mt-1 text-xs text-ink-soft max-w-md mx-auto">
              Get your trip started in 3 simple steps. Add members, track shared costs, and settle up effortlessly.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left max-w-3xl mx-auto">
            <div className="rounded-xl border border-hair bg-canvas/40 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  1
                </span>
                <h3 className="text-sm font-bold text-ink">Invite your crew</h3>
              </div>
              <p className="text-xs text-ink-soft">
                Share your private trip link or invite code with travel buddies.
              </p>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline pt-1"
              >
                <UserPlus size={13} /> Invite travelers →
              </button>
            </div>

            <div className="rounded-xl border border-hair bg-canvas/40 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  2
                </span>
                <h3 className="text-sm font-bold text-ink">Add your first expense</h3>
              </div>
              <p className="text-xs text-ink-soft">
                Log meals, stays, rides, or tickets with multi-currency minor math.
              </p>
              <Link
                to={`/trips/${tripId}/expenses/new`}
                className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline pt-1"
                aria-label="Add first expense"
              >
                <Plus size={13} /> Add first expense →
              </Link>
            </div>

            <div className="rounded-xl border border-hair bg-canvas/40 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  3
                </span>
                <h3 className="text-sm font-bold text-ink">Track & Settle with 0 math</h3>
              </div>
              <p className="text-xs text-ink-soft">
                Hissaab simplifies debts into minimum direct UPI settlement transfers.
              </p>
              <Link
                to={`/trips/${tripId}/balances`}
                className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline pt-1"
                aria-label="Explore Balances"
              >
                <Scale size={13} /> Explore Balances →
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Spending Trajectory & Category Donut Row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Daily Trajectory Widget (7 cols on lg) */}
            <div className="rounded-2xl border border-hair bg-surface p-6 shadow-2xs lg:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
                    <TrendingUp size={18} className="text-brand" />
                    Spending Trajectory
                  </h2>
                  <p className="text-xs text-ink-soft">
                    Day-by-day burn rate across {dayTimeline.length} travel days
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {peakDay && (
                    <span className="rounded-md bg-canvas px-2 py-1 font-semibold text-ink-soft border border-hair/50">
                      Peak: Day {peakDay.dayNumber} ({formatMinor(peakDay.totalMinor, baseCurrency)})
                    </span>
                  )}
                  <span className="rounded-md bg-brand/10 px-2 py-1 font-bold text-brand">
                    Avg: {formatMinor(avgDailySpend, baseCurrency)}/day
                  </span>
                </div>
              </div>

              {/* SVG Daily Bars */}
              <div className="pt-2">
                <DailyBars
                  data={dayTimeline.map((d) => ({
                    label: `D${d.dayNumber}`,
                    value: d.totalMinor,
                  }))}
                  currency={baseCurrency}
                />
              </div>
            </div>

            {/* Interactive Category Donut (5 cols on lg) */}
            <div className="rounded-2xl border border-hair bg-surface p-6 shadow-2xs lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
                    <PieChart size={18} className="text-brand" />
                    Spending by Category
                  </h2>
                  <p className="text-xs text-ink-soft">Where your group budget went</p>
                </div>
                <Link
                  to={`/trips/${tripId}/balances`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline"
                  aria-label="Detailed breakdown"
                >
                  Detailed breakdown <ArrowRight size={13} />
                </Link>
              </div>

              <div className="flex items-center justify-center pt-2">
                <Donut data={donutSegments} currency={baseCurrency} size={150} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                {activeCategories.map((c) => (
                  <div
                    key={c.category}
                    className="flex items-center justify-between rounded-lg bg-canvas/40 px-2.5 py-1.5 border border-hair/40"
                  >
                    <span className="font-semibold text-ink truncate">
                      {c.emoji} {c.label}
                    </span>
                    <span className="font-mono font-bold text-ink-soft ml-1">
                      {c.percentage.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 2-Column Section: Member Breakdown & Recent Activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left: Member Financial Spend Breakdown */}
            <div className="space-y-6 lg:col-span-7">
              <div className="rounded-2xl border border-hair bg-surface p-6 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold tracking-tight">
                      Member Breakdown ({memberCount})
                    </h2>
                    <p className="text-xs text-ink-soft">
                      Financial spend, share, and net standing
                    </p>
                  </div>
                  <Link
                    to={`/trips/${tripId}/settings`}
                    className="text-xs font-bold text-brand hover:underline"
                    aria-label="Manage"
                  >
                    Manage
                  </Link>
                </div>

                <ul className="mt-4 space-y-3">
                  {memberList.map((m: any) => {
                    const uid = m.user_id ?? m.id
                    const isCurrent = uid === user?.id
                    const r = balanceRows[uid] ?? { paid: 0, owed: 0, sent: 0, received: 0, net: 0 }
                    const paidPct = totalMinor > 0 ? Math.min(100, Math.round((r.paid / totalMinor) * 100)) : 0
                    const isPositive = r.net > 0
                    const isNegative = r.net < 0

                    return (
                      <li
                        key={uid}
                        className="rounded-xl border border-hair/60 bg-canvas/30 p-3.5 text-sm space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar
                              name={m.name}
                              id={uid}
                              isCurrentUser={isCurrent}
                              size="md"
                            />
                            <div>
                              <p className="font-bold text-xs text-ink">
                                {m.name}
                                {isCurrent && (
                                  <span className="ml-1.5 rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                                    You
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-ink-faint capitalize">
                                {m.role ?? "member"}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isPositive
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : isNegative
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                                : "bg-canvas text-ink-soft"
                            }`}
                          >
                            {isPositive
                              ? `+${formatMinor(r.net, baseCurrency)}`
                              : isNegative
                              ? `-${formatMinor(Math.abs(r.net), baseCurrency)}`
                              : memberList.length === 1
                              ? "Settled Up"
                              : "Settled"}
                          </span>
                        </div>

                        {/* Spend Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-ink-soft">
                            <span>
                              Paid: <b className="font-mono text-ink">{formatMinor(r.paid, baseCurrency)}</b> ({paidPct}%)
                            </span>
                            <span>
                              Share: <b className="font-mono text-ink">{formatMinor(r.owed, baseCurrency)}</b>
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas border border-hair/40">
                            <div
                              className="h-full bg-brand rounded-full transition-all"
                              style={{ width: `${paidPct}%` }}
                            />
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>

            {/* Right: Quick Simplified Settlements & Recent Transactions */}
            <div className="space-y-6 lg:col-span-5">
              {/* Quick Settlements Card */}
              <div className="rounded-2xl border border-hair bg-surface p-6 shadow-2xs">
                <div className="flex items-center justify-between border-b border-hair/40 pb-3">
                  <div>
                    <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
                      <HandCoins size={17} className="text-brand" />
                      Quick Settlements
                    </h2>
                    <p className="text-xs text-ink-soft">Minimum transfers to clear debts</p>
                  </div>
                  <Link
                    to={`/trips/${tripId}/balances`}
                    className="text-xs font-bold text-brand hover:underline"
                    aria-label="All"
                  >
                    All
                  </Link>
                </div>

                {simplifiedTransfers.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-800/60 dark:bg-emerald-950/40">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      🎉 Group is 100% settled up!
                    </p>
                  </div>
                ) : (
                  <ul className="mt-4 space-y-2.5">
                    {simplifiedTransfers.slice(0, 3).map((tr, idx) => {
                      const fromName = memberMap.get(tr.fromId) ?? "Member"
                      const toName = memberMap.get(tr.toId) ?? "Member"
                      return (
                        <li
                          key={idx}
                          className="flex items-center justify-between rounded-xl border border-hair bg-canvas/30 p-3 text-xs shadow-2xs"
                        >
                          <div>
                            <p className="font-semibold text-ink">
                              <span className="font-bold text-rose-600 dark:text-rose-400">{fromName}</span>{" "}
                              pays{" "}
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">{toName}</span>
                            </p>
                            <p className="mt-0.5 font-mono text-xs font-bold text-ink">
                              {formatMinor(tr.amount, baseCurrency)}
                            </p>
                          </div>
                          {!isArchived && !isSettled && (
                            <button
                              type="button"
                              onClick={() =>
                                setSettleTransfer({
                                  fromId: tr.fromId,
                                  toId: tr.toId,
                                  amount: tr.amount,
                                })
                              }
                              className="min-h-8 rounded-lg bg-brand px-3 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition-colors"
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

              {/* Recent Expenses Card */}
              <div className="rounded-2xl border border-hair bg-surface p-6 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold tracking-tight">Recent Expenses</h2>
                  <Link
                    to={`/trips/${tripId}/expenses`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline"
                    aria-label={`View all (${expenseCount})`}
                  >
                    View all ({expenseCount}) <ArrowRight size={14} />
                  </Link>
                </div>
                {recentExpenses.length === 0 ? (
                  <p className="mt-4 text-sm text-ink-soft">No expenses added yet.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-hair">
                    {recentExpenses.map((exp: any) => (
                      <li key={exp.id} className="py-2.5 first:pt-0 last:pb-0">
                        <Link
                          to={`/trips/${tripId}/expenses/${exp.id}`}
                          className="flex items-center justify-between hover:bg-canvas/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
                          aria-label={exp.description}
                        >
                          <div>
                            <p className="text-xs font-semibold text-ink">{exp.description}</p>
                            <p className="text-[10px] text-ink-soft">
                              {exp.category} · {exp.expense_date ?? exp.date}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold text-ink">
                            {formatMinor(exp.amount_minor ?? exp.amount ?? 0, baseCurrency)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Settlement Dialog */}
      {(settleTransfer || isGeneralSettleOpen) && (
        <SettlementDialog
          open
          onClose={() => {
            setSettleTransfer(null)
            setIsGeneralSettleOpen(false)
          }}
          tripId={tripId!}
          fromId={settleTransfer?.fromId ?? simplifiedTransfers[0]?.fromId ?? memberList[0]?.id}
          toId={settleTransfer?.toId ?? simplifiedTransfers[0]?.toId ?? memberList[1]?.id ?? memberList[0]?.id}
          fromName={memberMap.get(settleTransfer?.fromId ?? simplifiedTransfers[0]?.fromId ?? memberList[0]?.id)}
          toName={memberMap.get(settleTransfer?.toId ?? simplifiedTransfers[0]?.toId ?? memberList[1]?.id ?? memberList[0]?.id)}
          outstandingMinor={settleTransfer?.amount ?? simplifiedTransfers[0]?.amount ?? 1000}
          currency={baseCurrency}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["balances", tripId] })
            qc.invalidateQueries({ queryKey: ["expenses", tripId] })
            qc.invalidateQueries({ queryKey: ["settlements", tripId] })
            qc.invalidateQueries({ queryKey: ["trip", tripId] })
          }}
        />
      )}

      {/* Invite Traveler Modal */}
      <InviteTravelerModal
        open={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        tripId={tripId!}
        tripName={t.name ?? "Trip"}
      />

      {/* Share Trip Summary Modal */}
      <ShareSummaryModal
        open={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        opts={summaryCardOptions}
      />
    </div>
  )
}
