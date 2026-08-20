import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "./supabase"
import { useAuth } from "./auth"

export function useIsAdmin() {
  const { user } = useAuth()
  const supabase = getSupabase()
  return useQuery({
    queryKey: ["isAdmin", user?.id],
    queryFn: async () => {
      if (!supabase || !user) return false

      // 1) Check platform admin flag via RPC
      try {
        const { data: isAdminRpc, error: rpcErr } = await supabase.rpc("is_platform_admin", {
          p_user_id: user.id,
        } as never)
        if (!rpcErr && isAdminRpc) return true
      } catch {}

      // 2) Check if user is a trip owner via get_user_trips
      try {
        const { data: trips, error: tripsErr } = await supabase.rpc("get_user_trips", {
          p_user_id: user.id,
        } as never)
        if (!tripsErr && Array.isArray(trips) && (trips as any[]).some((t: any) => t.role === "owner")) {
          return true
        }
      } catch {}

      // 3) Direct table fallback for authenticated sessions
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_platform_admin")
          .eq("id", user.id)
          .maybeSingle()
        if ((profile as any)?.is_platform_admin) return true

        const { data: ownership } = await supabase
          .from("trip_members")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "owner")
          .limit(1)

        return (ownership && ownership.length > 0) || false
      } catch {
        return false
      }
    },
    enabled: !!user,
    staleTime: 60_000,
  })
}

// removed client authority per §5.1 — platform admin is server-provisioned only
// VITE_ADMIN_EMAILS is no longer read; is_platform_admin comes only from profiles via RLS
export function isAdminEmail(_email: string): boolean {
  return false
}
