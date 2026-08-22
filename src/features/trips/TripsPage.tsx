import { Link } from "react-router"
import { ArrowRight, Plus, Users } from "lucide-react"
import { useTripsQuery } from "./hooks"
import { formatMinor } from "@/lib/currency"
import { Skeleton } from "@/components/feedback/Skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"

export function TripsPage() {
  const { data: trips, isLoading, error } = useTripsQuery() as any
  const supabaseOn = !!import.meta.env.VITE_SUPABASE_URL
  return (
    <>
        {!supabaseOn && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Demo mode — `.env` not loaded (VITE_SUPABASE_URL missing). Showing mock trips. Restart `pnpm dev` after creating `.env`.
          </div>
        )}
        {supabaseOn && error && (
          <div className="mt-4 rounded-lg border border-owe/20 bg-owe-soft px-3 py-2 text-xs text-owe">
            Supabase error: {(error as Error).message} — check RLS / migration applied.
          </div>
        )}
        <div className="mt-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[.14em] text-brand">
              Your workspaces
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Trips, without the maths.
            </h1>
            <p className="mt-2 text-sm text-ink-soft">
              Choose a trip to review what’s spent, owed, and settled.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/join"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-hair bg-surface px-4 text-sm font-semibold hover:border-ink-faint"
            >
              <Users size={17} /> Join trip
            </Link>
            <Link
              to="/trips/new"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-blue-700"
            >
              <Plus size={17} /> New trip
            </Link>
          </div>
        </div>
        {isLoading ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : !trips?.length ? (
          <div className="mt-8">
            <EmptyState
              title="No trips yet"
              description="Create a trip or join with an invite code to get started."
              action={
                <Link
                  to="/trips/new"
                  className="inline-flex h-10 items-center rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-sm"
                >
                  Create trip
                </Link>
              }
            />
          </div>
        ) : (
          <section className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {trips.map((t: any) => (
              <Link
                key={t.id}
                to={`/trips/${t.id}`}
                className="group relative overflow-hidden rounded-2xl border border-hair bg-surface p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="absolute right-0 top-0 h-28 w-28 translate-x-8 -translate-y-8 rounded-full bg-brand-soft/60 transition-transform group-hover:scale-110" />
                <div className="relative flex items-start justify-between">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      t.status === "active"
                        ? "border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : t.status === "settled"
                        ? "border border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-800/60 dark:bg-blue-950/60 dark:text-blue-300"
                        : "border border-hair bg-canvas text-ink-faint"
                    }`}
                  >
                    {t.status}
                  </span>
                  <ArrowRight
                    size={18}
                    className="text-ink-faint transition-transform group-hover:translate-x-1 group-hover:text-brand"
                  />
                </div>
                <h2 className="relative mt-6 text-xl font-bold tracking-tight text-ink group-hover:text-brand transition-colors truncate">
                  {t.name}
                </h2>
                <p className="relative mt-1 text-xs text-ink-soft truncate">
                  📍 {t.destination || "Flexible"} · {t.start_date ?? t.dates ?? "Dates TBD"}
                </p>
                <div className="relative mt-6 grid grid-cols-3 border-t border-hair pt-4 text-xs">
                  <span>
                    <b className="block font-mono text-sm font-bold text-ink">
                      {t.total || t.total_minor ? formatMinor(t.total ?? t.total_minor ?? 0, t.base_currency ?? "INR") : "—"}
                    </b>
                    <span className="text-ink-faint text-[10px]">Tracked</span>
                  </span>
                  <span>
                    <b className="block text-sm font-bold text-ink">
                      {t.memberCount ?? "—"}
                    </b>
                    <span className="text-ink-faint text-[10px]">Travelers</span>
                  </span>
                  <span>
                    <b className="block text-sm font-bold text-ink capitalize">
                      {t.role ?? "member"}
                    </b>
                    <span className="text-ink-faint text-[10px]">Your role</span>
                  </span>
                </div>
              </Link>
            ))}
          </section>
        )}
    </>
  )
}
