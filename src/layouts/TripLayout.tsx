import { Outlet, useParams, NavLink, Link } from "react-router"
import { TripNavigation } from "@/components/navigation/TripNavigation"
import { useTrip } from "@/features/trips/hooks"
import { Home, Receipt, Scale, Activity as ActivityIcon, Settings2, ArrowLeft } from "lucide-react"
import { useEffect } from "react"
import { getSupabase } from "@/lib/supabase"
import { queryClient } from "@/lib/queryClient"
import { useOnline } from "@/lib/network"

export function TripLayout() {
  const { tripId } = useParams()
  const { data: trip } = useTrip(tripId!)
  const online = useOnline()
  const base = `/trips/${tripId}`
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase || !tripId) return
    const channel = supabase
      .channel(`trip:${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["expenses", tripId] })
          queryClient.invalidateQueries({ queryKey: ["balances", tripId] })
          queryClient.invalidateQueries({ queryKey: ["activity", tripId] })
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "settlements",
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["balances", tripId] })
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "audit_logs",
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["activity", tripId] })
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${tripId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["trip_members", tripId] })
          queryClient.invalidateQueries({ queryKey: ["trip", tripId] })
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_invites", filter: `trip_id=eq.${tripId}` },
        () => queryClient.invalidateQueries({ queryKey: ["invites", tripId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [tripId])
  const bottomTabs = [
    { to: base, end: true, label: "Overview", Icon: Home },
    { to: `${base}/expenses`, label: "Expenses", Icon: Receipt },
    { to: `${base}/balances`, label: "Balances", Icon: Scale },
    { to: `${base}/activity`, label: "Activity", Icon: ActivityIcon },
    { to: `${base}/settings`, label: "Settings", Icon: Settings2 },
  ] as const

  // Proper navigation: always render chrome. Skeleton keeps nav mounted so mobile/desktop never lose navigation.
  const headerTitle = trip?.name ?? (tripId ? "Trip" : "Trip")
  const headerDestination = trip?.destination ?? ""

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col bg-canvas">
      <a href="#trip-content" className="skip-link">Skip to content</a>
      <header className="border-b border-hair bg-surface px-4 py-5 sm:px-8">
        <div className="flex items-center justify-between mb-2">
          <Link to="/trips" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded px-1 -ml-1" aria-label="Back to all trips">
            <ArrowLeft size={14} /> All trips
          </Link>
          <div className="flex items-center gap-1.5 rounded-full border border-hair bg-canvas/60 px-2.5 py-1 text-xs font-medium text-ink-soft">
            <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500 shadow-xs" : "bg-amber-500"}`} />
            <span className="text-[11px]">{online ? "Live sync" : "Offline"}</span>
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {trip ? headerTitle : <span className="inline-block h-5 w-40 animate-pulse rounded bg-hair" />}
        </h1>
        <p className="text-sm text-ink-soft">
          {trip ? headerDestination : <span className="inline-block h-4 w-32 animate-pulse rounded bg-hair/60" />}{" "}
          {trip && (
            <span className="ml-2 rounded bg-canvas px-2 py-0.5 text-xs font-bold uppercase">
              {trip.status}
            </span>
          )}
        </p>
        {trip?.status === "archived" && (
          <div className="mt-3 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">
            Archived — read-only. No financial or membership changes allowed.
          </div>
        )}
      </header>
      <div className="hidden md:block sticky top-0 z-20 bg-surface border-b border-hair">
        <TripNavigation tripId={tripId!} base={base} />
      </div>
      <div id="trip-content" className="flex-1 p-4 pb-[88px] md:pb-8 sm:p-8">
        <Outlet />
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-hair bg-surface shadow-[0_-8px_24px_rgba(0,0,0,0.06)] md:hidden" aria-label="Trip sections">
        <div className="mx-auto grid h-[68px] w-full max-w-6xl grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {bottomTabs.map((t) => (
            <NavLink
              key={t.label}
              to={t.to}
              end={(t as any).end ?? false}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 text-[11px] transition ${isActive ? "text-brand" : "text-ink-soft"}`
              }
            >
              {({ isActive }) => (
                <>
                  <t.Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                  <span style={{ fontWeight: isActive ? 600 : 500 }}>{t.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
