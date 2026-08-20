import { Navigate, Outlet, useLocation } from "react-router"
import { useAuth } from "@/lib/auth"
import { FullPageSkeleton } from "@/components/feedback/Skeleton"

function safeReturnTo(path: string): string {
  try {
    const u = new URL(path, window.location.origin)
    if (u.origin !== window.location.origin) return "/trips"
    if (!u.pathname.startsWith("/")) return "/trips"
    return u.pathname + u.search + u.hash
  } catch { return "/trips" }
}
export function AuthGuard() {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <FullPageSkeleton />
  if (!user) {
    const rt = safeReturnTo(loc.pathname + loc.search)
    return <Navigate to={`/sign-in?returnTo=${encodeURIComponent(rt)}`} replace />
  }
  return <Outlet />
}
export function GuestGuard() {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <FullPageSkeleton />
  if (user) {
    const params = new URLSearchParams(loc.search)
    const rawRet = params.get("returnTo")
    const ret = rawRet ? safeReturnTo(rawRet) : "/trips"
    return <Navigate to={ret} replace />
  }
  return <Outlet />
}
