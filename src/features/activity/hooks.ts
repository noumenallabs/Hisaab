import { useInfiniteQuery } from "@tanstack/react-query"
import { fetchAudit } from "./api"
import { getSupabase } from "@/lib/supabase"

export function useActivity(tripId: string, limit = 20) {
  return useInfiniteQuery({
    queryKey: ["activity", tripId],
    queryFn: ({ pageParam }) =>
      fetchAudit(tripId, pageParam as { created_at: string; id: number } | undefined, limit),
    initialPageParam: undefined as { created_at: string; id: number } | undefined,
    getNextPageParam: (lastPage: any[]) => {
      if (!lastPage || lastPage.length < limit) return undefined
      const last = lastPage[lastPage.length - 1]
      return last ? { created_at: last.created_at, id: last.id } : undefined
    },
    enabled: !!tripId,
  })
}
