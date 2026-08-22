import { useParams, Link } from "react-router"
import { useExpenses } from "./hooks"
import { getSupabase } from "@/lib/supabase"
import { formatMinor } from "@/lib/currency"
import { useTrip } from "@/features/trips/hooks"
import { useTripMembers } from "@/features/trips/useMembers"
import { Skeleton } from "@/components/feedback/Skeleton"
import { Plus, Search } from "lucide-react"
import { useMemo, useState, useEffect } from "react"

import { useAuth } from "@/lib/auth"

export function ExpensesPage() {
  const { tripId } = useParams()
  const { user } = useAuth()
  const { data: trip } = useTrip(tripId!)
  const { data: members } = useTripMembers(tripId ?? "")
  const memberMap = useMemo(
    () =>
      new Map(
        ((members as any[]) ?? []).map((m: any) => [
          m.user_id ?? m.id,
          m.name ?? m.email ?? (m.user_id ?? m.id)?.slice(0, 8),
        ])
      ),
    [members]
  )
  const isOwner = !!(user?.id && (members as any[])?.some((m) => (m.user_id === user.id || m.id === user.id) && m.role === "owner"))
  const [showDeleted, setShowDeleted] = useState(false)
  const effectiveIncludeDeleted = isOwner && showDeleted
  const q = useExpenses(tripId!, { includeDeleted: effectiveIncludeDeleted })
  const supabase = getSupabase()
  const [query, setQuery] = useState("")
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "amount" | "updated">("newest")
  const [category, setCategory] = useState<string>("all")
  const [visible, setVisible] = useState(100)
  const [payer, setPayer] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  if (!supabase) return <div className="p-6 text-center text-sm text-ink-soft" role="alert">Supabase not configured — check env.</div>
  const list = (q.data as any[] ?? [])
  const filtered = useMemo(
    () =>
      list.filter((e: any) => {
        if (!showDeleted && e.deleted_at) return false
        const q = query.toLowerCase()
        const desc = String(e.description ?? "").toLowerCase()
        const notes = String(e.notes ?? "").toLowerCase()
        const matchesQuery = desc.includes(q) || notes.includes(q)
        const matchesCategory = category === "all" || e.category === category
        const d = String(e.expense_date ?? e.date ?? "")
        const matchesFrom = !dateFrom || d >= dateFrom
        const matchesTo = !dateTo || d <= dateTo
        const payers = (e.expense_payers ?? e.payers ?? []) as any[]
        const matchesPayer = payer === "all" || payers.some((p: any) => (p.user_id ?? p.userId) === payer)
        return matchesQuery && matchesCategory && matchesFrom && matchesTo && matchesPayer
      }),
    [list, query, category, payer, dateFrom, dateTo, showDeleted],
  )
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a: any, b: any) => {
      if (sortBy === "newest") return String(b.expense_date ?? b.date ?? "").localeCompare(String(a.expense_date ?? a.date ?? ""))
      if (sortBy === "oldest") return String(a.expense_date ?? a.date ?? "").localeCompare(String(b.expense_date ?? b.date ?? ""))
      if (sortBy === "amount") return (b.amount_minor ?? b.amount ?? 0) - (a.amount_minor ?? a.amount ?? 0)
      if (sortBy === "updated") return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
      return 0
    })
    return arr
  }, [filtered, sortBy])
  if (supabase && q.isLoading) return <Skeleton className="h-40" />
  const isArchived = (trip as any)?.status === "archived"
  const isSettled = (trip as any)?.status === "settled"
  const canAdd = !isArchived && !isSettled
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Expenses</h1>
          <p className="text-xs text-ink-soft">
            Showing {Math.min(visible, filtered.length)} of {filtered.length} {filtered.length !== list.length ? `filtered (${list.length} total)` : ""} transactions
          </p>
        </div>
        {canAdd ? (
          <Link
            to={`/trips/${tripId}/expenses/new`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} /> Add expense
          </Link>
        ) : (
          <span className="text-xs text-ink-faint" role="status">
            {isArchived ? "Archived — read-only" : "Settled — no new expenses"}
          </span>
        )}
      </div>

      {/* Desktop Filter Toolbar */}
      <div className="rounded-2xl border border-hair bg-surface p-4 shadow-2xs space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-3.5 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search description, notes, or items..."
            className="w-full min-h-11 rounded-xl border border-hair bg-canvas/40 py-2 pl-10 pr-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs">
          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-ink-soft">Category:</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-hair bg-surface px-2.5 py-1.5 font-medium outline-none focus:border-brand"
            >
              <option value="all">All categories</option>
              <option value="food">🍕 Food</option>
              <option value="transport">🚕 Transport</option>
              <option value="accommodation">🏨 Accommodation</option>
              <option value="tickets">🎟️ Tickets</option>
              <option value="shopping">🛍️ Shopping</option>
              <option value="other">📦 Other</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-ink-soft">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-lg border border-hair bg-surface px-2.5 py-1.5 font-medium outline-none focus:border-brand"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount">Highest amount</option>
              <option value="updated">Recently updated</option>
            </select>
          </div>

          {/* Payer Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-ink-soft">Paid by:</span>
            <select
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              className="rounded-lg border border-hair bg-surface px-2.5 py-1.5 font-medium outline-none focus:border-brand"
            >
              <option value="all">Anyone</option>
              {Array.from(new Map(list.flatMap((e: any) => (e.expense_payers ?? e.payers ?? [])).map((p: any) => [p.user_id ?? p.userId, p])).values()).map((p: any) => {
                const pid = p.user_id ?? p.userId
                return (
                  <option key={pid} value={pid}>
                    {memberMap.get(pid) ?? String(pid).slice(0, 8)}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Date range inputs */}
          <div className="flex items-center gap-1">
            <span className="font-semibold text-ink-soft">From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-hair bg-surface px-2 py-1 font-medium outline-none focus:border-brand"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold text-ink-soft">To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-hair bg-surface px-2 py-1 font-medium outline-none focus:border-brand"
            />
          </div>

          {isOwner && (
            <label className="flex items-center gap-1.5 font-semibold text-ink-soft cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                className="rounded border-hair"
              />
              <span>Show deleted</span>
            </label>
          )}
        </div>
      </div>

      {sorted.length === 0 && list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hair bg-surface p-12 text-center" role="status">
          <p className="text-base font-bold">No expenses recorded yet</p>
          <p className="mt-1 text-xs text-ink-soft">Add your first expense to calculate splits and group balances.</p>
          {canAdd && (
            <Link
              to={`/trips/${tripId}/expenses/new`}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
            >
              <Plus size={16} /> Add expense
            </Link>
          )}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-hair bg-surface p-10 text-center" role="status">
          <p className="text-base font-bold">No matching expenses</p>
          <p className="mt-1 text-xs text-ink-soft">No expenses matched your filter criteria.</p>
          <button
            onClick={() => {
              setQuery("")
              setCategory("all")
              setPayer("all")
              setDateFrom("")
              setDateTo("")
            }}
            className="mt-4 min-h-10 rounded-xl border border-hair px-4 text-xs font-semibold hover:bg-canvas"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const groups = new Map<string, any[]>()
            for (const e of sorted.slice(0, visible)) {
              const d = String(e.expense_date ?? e.date ?? "").slice(0, 10)
              const key = d || "No date"
              if (!groups.has(key)) groups.set(key, [])
              groups.get(key)!.push(e)
            }
            const catIcons: Record<string, string> = {
              food: "🍕",
              transport: "🚕",
              accommodation: "🏨",
              tickets: "🎟️",
              shopping: "🛍️",
              other: "📦",
            }
            return Array.from(groups.entries()).map(([date, items]) => (
              <div key={date} className="space-y-2">
                <p className="px-1 text-xs font-bold uppercase tracking-wider text-ink-soft">
                  {date === "No date" ? date : new Date(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                </p>
                <div className="overflow-hidden rounded-2xl border border-hair bg-surface shadow-2xs divide-y divide-hair">
                  {items.map((e: any) => {
                    const payers = e.expense_payers ?? e.payers ?? []
                    const payerNames = payers.map((p: any) => memberMap.get(p.user_id ?? p.userId) ?? "Member").join(", ")
                    const splitCount = (e.expense_splits ?? e.splits ?? []).length
                    const isDel = !!e.deleted_at

                    return (
                      <Link
                        key={e.id}
                        to={`/trips/${tripId}/expenses/${e.id}`}
                        className={`flex items-center justify-between p-4 transition-colors hover:bg-canvas/60 ${
                          isDel ? "opacity-60 bg-red-50/40 dark:bg-red-950/30" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-lg border border-hair">
                            {catIcons[e.category] ?? "📦"}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm text-ink truncate">{e.description}</p>
                              {isDel && (
                                <span className="rounded bg-owe/10 px-1.5 py-0.5 text-[10px] font-bold text-owe">
                                  Deleted
                                </span>
                              )}
                              {e.receipt_path && (
                                <span className="text-xs" title="Has receipt">📎</span>
                              )}
                            </div>
                            <p className="text-xs text-ink-soft mt-0.5 truncate">
                              Paid by <span className="font-medium text-ink">{payerNames || "—"}</span> · Split among {splitCount} people
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 ml-4">
                          <p className="font-mono text-base font-bold text-ink">
                            {formatMinor(e.amount_minor ?? e.amount ?? 0, (trip as any)?.base_currency ?? "INR")}
                          </p>
                          <span className="text-[11px] font-semibold text-brand">View details →</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))
          })()}

          {sorted.length > visible && (
            <div className="pt-2 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => setVisible((v) => v + 50)}
                className="min-h-11 rounded-xl border border-hair bg-surface px-5 text-xs font-bold hover:bg-canvas shadow-2xs"
              >
                Load more ({sorted.length - visible} remaining)
              </button>
              <button
                onClick={() => setVisible(sorted.length)}
                className="min-h-11 rounded-xl border border-hair bg-surface px-5 text-xs font-bold text-brand hover:bg-canvas shadow-2xs"
              >
                Show all ({sorted.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
