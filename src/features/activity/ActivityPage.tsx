import { useParams } from "react-router"
import { useActivity } from "./hooks"
import { getSupabase } from "@/lib/supabase"
import { Skeleton } from "@/components/feedback/Skeleton"
import { useTripMembers } from "@/features/trips/useMembers"
import { useState, useMemo } from "react"

function humanSummary(a: any, name: string) {
  const map: Record<string, string> = {
    create: "created",
    update: "updated",
    soft_delete: "deleted",
    restore: "restored",
    join: "joined",
    remove: "removed",
    role_change: "changed role for",
    settle: "recorded a settlement for",
    archive: "archived",
  }
  const act = map[a.action] ?? a.action
  const entity = a.entity_type === "member" ? "member" : a.entity_type
  return `${name} ${act} ${entity}`
}

function actionColor(action: string) {
  switch (action) {
    case "create":
    case "join":
      return "bg-blue-100 text-blue-800 border-blue-200"
    case "settle":
    case "restore":
      return "bg-emerald-100 text-emerald-800 border-emerald-200"
    case "soft_delete":
    case "remove":
      return "bg-red-100 text-red-800 border-red-200"
    case "update":
    case "role_change":
    case "archive":
    default:
      return "bg-amber-100 text-amber-800 border-amber-200"
  }
}

export function ActivityPage() {
  const { tripId } = useParams()
  const supabase = getSupabase()
  const q = useActivity(tripId!)
  const { data: members } = useTripMembers(tripId!)
  const [filter, setFilter] = useState<"all" | "expense" | "settlement" | "member">("all")

  const memberMap = useMemo(
    () => new Map((members as any ?? []).map((m: any) => [m.user_id, m.name])),
    [members]
  )

  const pages = q.data?.pages.flat() ?? []
  const filteredPages = useMemo(() => {
    if (filter === "all") return pages
    return pages.filter((a: any) => a.entity_type === filter)
  }, [pages, filter])

  if (!supabase) return <div className="p-6 text-center text-sm text-ink-soft" role="alert">Supabase not configured — check env.</div>
  if (q.isLoading) return <Skeleton className="h-48 rounded-2xl" />
  if (q.error) return <div className="rounded-xl bg-owe-soft p-4 text-sm text-owe" role="alert">Failed to load activity: {(q.error as any).message} <button onClick={() => q.refetch()} className="ml-2 underline font-bold">Retry</button></div>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Activity Log</h1>
          <p className="text-xs text-ink-soft">Full audit history of changes and financial events in this trip</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-hair bg-surface p-1 text-xs font-semibold">
          {(["all", "expense", "settlement", "member"] as const).map((f) => (
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

      {filteredPages.length === 0 ? (
        <div className="rounded-2xl border border-hair bg-surface p-10 text-center text-sm text-ink-soft">
          No {filter === "all" ? "" : filter} activity recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPages.map((a: any) => {
            const name = (memberMap.get(a.actor_user_id as string) as string | undefined) ?? "Member"
            return (
              <div key={a.id} className="rounded-2xl border border-hair bg-surface p-4 shadow-2xs transition-all hover:shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{humanSummary(a, name)}</p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${actionColor(a.action)}`}>
                    {a.action.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  {new Date(a.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
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
