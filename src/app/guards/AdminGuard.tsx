import { Navigate, Outlet, Link } from "react-router"
import { useAuth } from "@/lib/auth"
import { useIsAdmin } from "@/lib/useAdmin"
import { getSupabase } from "@/lib/supabase"
import { FullPageSkeleton } from "@/components/feedback/Skeleton"

export function AdminGuard() {
  const { user, loading } = useAuth()
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin()
  const supabase = getSupabase()

  if (loading || (supabase && adminLoading)) return <FullPageSkeleton />
  if (!user) return <Navigate to="/sign-in" replace />
  // Demo mode: first user is admin (trigger auto-promotes), allow through
  if (!supabase) return <Outlet />
  if (!isAdmin) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-canvas p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">Not an admin</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-ink-soft">
            Only admins can sign in here. Regular members join via invite code at <Link to="/join" className="font-semibold text-brand underline">/join</Link>.
          </p>
          <Link to="/join" className="mt-4 inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white">Go to join</Link>
        </div>
      </main>
    )
  }
  return <Outlet />
}
