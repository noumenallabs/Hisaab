import { Link, useParams } from "react-router"
import { useTrip } from "./hooks"
import { useTripMembers } from "./useMembers"
import { useExpenses } from "@/features/expenses/hooks"
import { getSupabase } from "@/lib/supabase"
import { formatMinor } from "@/lib/currency"
import { Skeleton } from "@/components/feedback/Skeleton"
import { Plus, Receipt, Scale, Activity as ActivityIcon, Settings2, Users, ArrowRight } from "lucide-react"

export function TripOverviewPage() {
  const { tripId } = useParams()
  const { data: trip, isLoading } = useTrip(tripId!)
  const { data: members } = useTripMembers(tripId ?? "")
  const { data: expenses } = useExpenses(tripId!)
  const supabase = getSupabase()

  if (isLoading) return <Skeleton className="h-48 rounded-2xl" />
  if (!trip) return <div className="p-6 text-center text-sm text-ink-soft" role="alert">Trip not found or you lack access.</div>

  const t = trip as any
  const isArchived = t.status === "archived"
  const isSettled = t.status === "settled"
  const memberList = (members as any[]) ?? []
  const memberCount = memberList.length
  const expenseList = (expenses as any[]) ?? []
  const expenseCount = expenseList.length
  const totalMinor = expenseList.reduce((s: number, e: any) => s + (e.amount_minor ?? 0), 0)
  const avgMinor = memberCount > 0 ? Math.round(totalMinor / memberCount) : 0
  const recentExpenses = expenseList.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="rounded-2xl border border-hair bg-surface p-6 sm:p-8 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                t.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-canvas text-ink-soft"
              }`}>
                {t.status}
              </span>
              <span className="text-xs font-semibold text-ink-soft">
                {t.base_currency}
              </span>
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">{t.name}</h1>
            {t.destination && (
              <p className="mt-1 text-sm text-ink-soft">
                📍 {t.destination} · {t.start_date} → {t.end_date}
              </p>
            )}
          </div>
          {!isArchived && !isSettled && (
            <Link
              to={`/trips/${tripId}/expenses/new`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} /> Add expense
            </Link>
          )}
        </div>
        {isArchived && (
          <p role="alert" className="mt-4 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white">
            Archived trip — read-only mode.
          </p>
        )}
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-hair bg-surface p-5 shadow-2xs">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Total Spending</p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink">
            {formatMinor(totalMinor, t.base_currency)}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">Across all expenses</p>
        </div>
        <div className="rounded-2xl border border-hair bg-surface p-5 shadow-2xs">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Avg / Person</p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink">
            {formatMinor(avgMinor, t.base_currency)}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">For {memberCount} members</p>
        </div>
        <div className="rounded-2xl border border-hair bg-surface p-5 shadow-2xs">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Expenses</p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink">
            {expenseCount}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">Transactions recorded</p>
        </div>
        <div className="rounded-2xl border border-hair bg-surface p-5 shadow-2xs">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Trip Members</p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink">
            {memberCount}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">Active in group</p>
        </div>
      </div>

      {/* 2-Column Desktop Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Recent Expenses & Quick Shortcuts */}
        <div className="space-y-6 lg:col-span-8">
          <div className="rounded-2xl border border-hair bg-surface p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold tracking-tight">Recent Expenses</h2>
              <Link to={`/trips/${tripId}/expenses`} className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">
                View all ({expenseCount}) <ArrowRight size={14} />
              </Link>
            </div>
            {recentExpenses.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">No expenses added yet. Tap "Add expense" to start.</p>
            ) : (
              <ul className="mt-4 divide-y divide-hair">
                {recentExpenses.map((exp: any) => (
                  <li key={exp.id} className="py-3 first:pt-0 last:pb-0">
                    <Link to={`/trips/${tripId}/expenses/${exp.id}`} className="flex items-center justify-between hover:bg-canvas/50 -mx-2 px-2 py-1 rounded-lg transition-colors">
                      <div>
                        <p className="text-sm font-semibold text-ink">{exp.description}</p>
                        <p className="text-xs text-ink-soft">
                          {exp.category} · {exp.expense_date ?? exp.date}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-bold text-ink">
                        {formatMinor(exp.amount_minor ?? exp.amount ?? 0, t.base_currency)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Navigation Quick Shortcuts */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link to={`/trips/${tripId}/expenses`} className="flex flex-col items-center justify-center rounded-xl border border-hair bg-surface p-4 text-center hover:bg-canvas transition-colors shadow-2xs">
              <Receipt className="text-brand mb-1" size={20} />
              <span className="text-xs font-bold">Expenses</span>
            </Link>
            <Link to={`/trips/${tripId}/balances`} className="flex flex-col items-center justify-center rounded-xl border border-hair bg-surface p-4 text-center hover:bg-canvas transition-colors shadow-2xs">
              <Scale className="text-brand mb-1" size={20} />
              <span className="text-xs font-bold">Balances</span>
            </Link>
            <Link to={`/trips/${tripId}/activity`} className="flex flex-col items-center justify-center rounded-xl border border-hair bg-surface p-4 text-center hover:bg-canvas transition-colors shadow-2xs">
              <ActivityIcon className="text-brand mb-1" size={20} />
              <span className="text-xs font-bold">Activity</span>
            </Link>
            <Link to={`/trips/${tripId}/settings`} className="flex flex-col items-center justify-center rounded-xl border border-hair bg-surface p-4 text-center hover:bg-canvas transition-colors shadow-2xs">
              <Settings2 className="text-brand mb-1" size={20} />
              <span className="text-xs font-bold">Settings</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Group Members */}
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-2xl border border-hair bg-surface p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold tracking-tight">Members ({memberCount})</h2>
              <Link to={`/trips/${tripId}/settings`} className="text-xs font-bold text-brand hover:underline">
                Manage
              </Link>
            </div>
            <ul className="mt-4 space-y-2">
              {memberList.map((m: any) => (
                <li key={m.user_id ?? m.id} className="flex items-center justify-between rounded-xl border border-hair/60 bg-canvas/30 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                      {(m.name ?? "?")[0].toUpperCase()}
                    </span>
                    <div>
                      <p className="font-semibold text-xs text-ink">{m.name}</p>
                      <p className="text-[10px] text-ink-faint capitalize">{m.role ?? "member"}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
