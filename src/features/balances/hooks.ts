import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/lib/supabase"

export function useBalances(tripId: string) {
  return useQuery({
    queryKey: ["balances", tripId],
    queryFn: async () => {
      const supabase = getSupabase()
      if (!supabase || !tripId) return []
      let customUserId: string | null = null
      try {
        const stored = localStorage.getItem("tripsplit:custom-user")
        if (stored) customUserId = JSON.parse(stored)?.id ?? null
      } catch {}

      const { data, error } = await supabase.rpc("get_trip_balances", {
        p_trip_id: tripId,
        p_user_id: customUserId,
      } as never)
      if (error) {
        console.warn("[useBalances]", error.message)
        return []
      }
      return data ?? []
    },
    enabled: !!tripId,
  })
}
