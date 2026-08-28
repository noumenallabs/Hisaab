import { useParams } from "react-router"
import { useActivity } from "./hooks"
import { getSupabase } from "@/lib/supabase"
import { Skeleton } from "@/components/feedback/Skeleton"
import { useTripMembers } from "@/features/trips/useMembers"
import { useExpenses } from "@/features/expenses/hooks"
import { useTrip } from "@/features/trips/hooks"
import { formatActivitySummary } from "./activitySummary"
import { useState, useMemo } from "react"
import { UserAvatar } from "@/components/feedback/UserAvatar"
import { History } from "lucide-react"

function actionColor(action: string) {
  switch (action) {
    case "create":
    case "join":
      return "border border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-800/60 dark:bg-blue-950/60 dark:text-blue-300"
    case "settle":
    case "restore":
      return "border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300"
    case "soft_delete":
    case "remove":
      return "border border-red-200 bg-red-100 text-red-800 dark:border-red-800/60 dark:bg-red-950/60 dark:text-red-300"
    case "update":
    case "role_change":
    case "archive":
    default:
      return "border border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/60 dark:text-amber-300"
  }
}

export function ActivityPage() {
  const { tripId } = useParams()
  const [filter, setFilter] = useState<string>("all")
  const q = useActivity(tripId!)
  const { data: trip } = useTrip(tripId!)
  const { data: members } = useTripMembers(tripId!)
  const { data: expenses } = useExpenses(tripId!)
  const baseCurrency = (trip as any)?.base_currency ?? "INR"

  const memberMap = useMemo(() => {
    const map = new Map<string, string>()
    if (members) {
      for (const m of members as any[]) {
        const id = (m.user_id ?? m.id) as string
        map.set(id, m.name ?? m.email ?? id.slice(0, 8))
      }
    }
    return map
  }, [members])

  const expensesMap = useMemo(() => {
    const map = new Map<string, any>()
    if (expenses) {
      for (const e of expenses as any[]) {
        map.set(e.id, e)
      }
    }
    return map
  }, [expenses])
  const rawPages = (q.data?.pages?.flat() ?? []) as any[]
  const pages = useMemo(() => {
    const seen = new Set<string | number>()
    return rawPages.filter((item: any) => {
      if (!item || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
  }, [rawPages])

  const filteredPages = useMemo(() => {
    if (filter === "all") return pages
    return pages.filter((a: any) => {
      if (filter === "expenses") return ["create", "update", "soft_delete", "restore"].includes(a.action)
      if (filter === "members") return ["join", "role_change", "remove"].includes(a.action)
      if (filter === "settlements") return a.action === "settle"
      return true
    })
  }, [pages, filter])

  if (!getSupabase()) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold">Activity log</h2>
        <div className="rounded-xl border border-hair bg-surface p-6 text-sm text-ink-soft">
          Activity log is available when connected to Supabase backend.
        </div>
      </div>
    )
  }

  if (q.isLoading) {
    return <Skeleton className="h-48 rounded-xl" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold">Activity log</h2>
        <div className="flex items-center gap-1 rounded-xl bg-canvas p-1 text-xs font-semibold">
          {["all", "expenses", "settlements", "members"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 capitalize transition-colors ${
                filter === f ? "bg-brand text-white" : "text-ink-soft hover:bg-canvas"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {!getSupabase() && (
        <div className="rounded-xl border border-hair bg-canvas/60 p-3 text-xs text-ink-soft">
          <span className="font-semibold text-ink">Demo mode</span> — live activity log stream requires Supabase connection.
        </div>
      )}

      {filteredPages.length === 0 ? (
        <div className="rounded-2xl border border-hair bg-surface p-12 text-center shadow-2xs space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-canvas text-ink-soft border border-hair">
            <History size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-ink">No {filter === "all" ? "" : filter} activity recorded yet</p>
            <p className="mt-1 text-xs text-ink-soft">All trip expenses, settlements, and member edits will appear here in chronological order.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPages.map((a: any) => {
            const actorId = a.actor_user_id as string
            const name = (memberMap.get(actorId) as string | undefined) ?? "Member"
            return (
              <div key={a.id} className="rounded-2xl border border-hair bg-surface p-4 shadow-2xs transition-all hover:shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <UserAvatar id={actorId} name={name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{formatActivitySummary(a, name, memberMap, expensesMap, baseCurrency)}</p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {new Date(a.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${actionColor(a.action)}`}>
                    {a.action.replace("_", " ")}
                  </span>
                </div>
                {a.changed_fields?.length > 0 && (
                  <div className="mt-2.5 rounded-lg bg-canvas/60 px-3 py-1.5 text-xs text-ink-soft border border-hair/40">
                    <span className="font-semibold text-ink">Modified fields:</span> {a.changed_fields.join(", ")}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {q.hasNextPage && (
        <div className="text-center pt-2">
          <button
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            className="min-h-11 rounded-xl border border-hair bg-surface px-6 text-xs font-bold hover:bg-canvas shadow-2xs disabled:opacity-50"
          >
            {q.isFetchingNextPage ? "Loading…" : "Load more activity"}
          </button>
        </div>
      )}
    </div>
  )
}
