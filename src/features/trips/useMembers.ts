import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/lib/supabase"

export type TripMember = { user_id: string; role: "owner" | "member"; name: string; email: string; avatar_path: string | null; joined_at: string }

export const tripMembersKeys = {
  all: ["trip_members"] as const,
  list: (tripId: string) => [...tripMembersKeys.all, tripId] as const,
}

export function useTripMembers(tripId: string) {
  const supabase = getSupabase()
  return useQuery({
    queryKey: tripMembersKeys.list(tripId),
    queryFn: async () => {
      if (!supabase || !tripId) return [] as TripMember[]

      // 1. Try RPC get_trip_members_list
      let customUserId: string | null = null
      try {
        const stored = localStorage.getItem("tripsplit:custom-user")
        if (stored) customUserId = JSON.parse(stored)?.id ?? null
      } catch {}

      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc("get_trip_members_list", {
          p_trip_id: tripId,
          p_user_id: customUserId,
        } as never)
        if (!rpcErr && rpcData && Array.isArray(rpcData)) {
          return rpcData as TripMember[]
        }
      } catch {}

      // 2. Direct fallback
      try {
        const { data: members, error } = await supabase
          .from("trip_members")
          .select("user_id, role, joined_at")
          .eq("trip_id", tripId)
          .order("joined_at", { ascending: true })
        if (error || !members?.length) return [] as TripMember[]
        const ids = (members as any[]).map((m) => m.user_id)
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, name, email, avatar_path")
          .in("id", ids)
        const byId = new Map((profiles as any[] ?? []).map((p) => [p.id, p]))
        return (members as any[]).map((m) => {
          const p = byId.get(m.user_id)
          return {
            user_id: m.user_id,
            role: m.role,
            joined_at: m.joined_at,
            name: p?.name ?? m.user_id.slice(0, 8),
            email: p?.email ?? "",
            avatar_path: p?.avatar_path ?? null,
          }
        }) as TripMember[]
      } catch {
        return [] as TripMember[]
      }
    },
    enabled: !!tripId,
  })
}
